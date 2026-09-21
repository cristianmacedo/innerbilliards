import { useCallback, useEffect, useRef, useState } from 'react'

const initialShot = { ball: { x: 0.31, y: 0.62 }, aim: { x: 0.76, y: 0.36 } }
const initialShape = [
  { x: 0.055, y: 0.085 },
  { x: 0.945, y: 0.085 },
  { x: 0.945, y: 0.915 },
  { x: 0.055, y: 0.915 },
]
const hexagonShape = [
  { x: 0.18, y: 0.085 },
  { x: 0.82, y: 0.085 },
  { x: 0.945, y: 0.5 },
  { x: 0.82, y: 0.915 },
  { x: 0.18, y: 0.915 },
  { x: 0.055, y: 0.5 },
]
const ellipseShape = Array.from({ length: 24 }, (_, index) => {
  const angle = (index / 24) * Math.PI * 2
  return { x: 0.5 + Math.cos(angle) * 0.445, y: 0.5 + Math.sin(angle) * 0.415 }
})
const shapePresets = [
  { id: 'rectangle', label: 'Retângulo', shape: initialShape },
  { id: 'hexagon', label: 'Hexágono', shape: hexagonShape },
  { id: 'ellipse', label: 'Elipse', shape: ellipseShape },
]

const cross = (a, b) => a.x * b.y - a.y * b.x
const dot = (a, b) => a.x * b.x + a.y * b.y

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1
  return { x: vector.x / length, y: vector.y / length }
}

function polygonCenter(points) {
  return points.reduce((center, point) => ({ x: center.x + point.x / points.length, y: center.y + point.y / points.length }), { x: 0, y: 0 })
}

function insetPolygon(polygon, amount) {
  const signedArea = polygon.reduce((area, point, index) => {
    const next = polygon[(index + 1) % polygon.length]
    return area + point.x * next.y - next.x * point.y
  }, 0)
  const inwardSide = signedArea >= 0 ? 1 : -1

  return polygon.map((point, index) => {
    const previous = polygon[(index - 1 + polygon.length) % polygon.length]
    const next = polygon[(index + 1) % polygon.length]
    const previousEdge = normalizeVector({ x: point.x - previous.x, y: point.y - previous.y })
    const nextEdge = normalizeVector({ x: next.x - point.x, y: next.y - point.y })
    const previousNormal = { x: -previousEdge.y * inwardSide, y: previousEdge.x * inwardSide }
    const nextNormal = { x: -nextEdge.y * inwardSide, y: nextEdge.x * inwardSide }
    const previousLine = { x: point.x + previousNormal.x * amount, y: point.y + previousNormal.y * amount }
    const nextLine = { x: point.x + nextNormal.x * amount, y: point.y + nextNormal.y * amount }
    const denominator = cross(previousEdge, nextEdge)

    if (Math.abs(denominator) < 0.000001) {
      return {
        x: point.x + (previousNormal.x + nextNormal.x) * amount * 0.5,
        y: point.y + (previousNormal.y + nextNormal.y) * amount * 0.5,
      }
    }

    const betweenLines = { x: nextLine.x - previousLine.x, y: nextLine.y - previousLine.y }
    const distanceAlongPrevious = cross(betweenLines, nextEdge) / denominator
    return {
      x: previousLine.x + previousEdge.x * distanceAlongPrevious,
      y: previousLine.y + previousEdge.y * distanceAlongPrevious,
    }
  })
}

function pointInPolygon(point, polygon) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]
    const b = polygon[previous]
    const crosses = (a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

function nearestPointOnSegment(point, start, end) {
  const segment = { x: end.x - start.x, y: end.y - start.y }
  const lengthSquared = dot(segment, segment) || 1
  const amount = Math.max(0, Math.min(1, dot({ x: point.x - start.x, y: point.y - start.y }, segment) / lengthSquared))
  const nearest = { x: start.x + segment.x * amount, y: start.y + segment.y * amount }
  return { point: nearest, distance: Math.hypot(point.x - nearest.x, point.y - nearest.y) }
}

function getPath(start, direction, bounces, polygon) {
  const points = [start]
  let point = { ...start }
  let vector = { ...direction }
  const epsilon = 0.05

  for (let bounce = 0; bounce <= bounces; bounce += 1) {
    let nearestHit = null

    polygon.forEach((edgeStart, index) => {
      const edgeEnd = polygon[(index + 1) % polygon.length]
      const segment = { x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y }
      const denominator = cross(vector, segment)
      if (Math.abs(denominator) < 0.000001) return

      const offset = { x: edgeStart.x - point.x, y: edgeStart.y - point.y }
      const time = cross(offset, segment) / denominator
      const position = cross(offset, vector) / denominator
      if (time > epsilon && position >= -0.0001 && position <= 1.0001 && (!nearestHit || time < nearestHit.time)) {
        nearestHit = { time, segment }
      }
    })

    if (!nearestHit) break
    const hitPoint = { x: point.x + vector.x * nearestHit.time, y: point.y + vector.y * nearestHit.time }
    points.push(hitPoint)
    if (bounce === bounces) break

    const normal = normalizeVector({ x: -nearestHit.segment.y, y: nearestHit.segment.x })
    const projection = dot(vector, normal)
    vector = normalizeVector({ x: vector.x - 2 * projection * normal.x, y: vector.y - 2 * projection * normal.y })
    point = { x: hitPoint.x + vector.x * epsilon * 2, y: hitPoint.y + vector.y * epsilon * 2 }
  }

  return points
}

function drawPolygonPath(context, polygon) {
  context.beginPath()
  context.moveTo(polygon[0].x, polygon[0].y)
  polygon.slice(1).forEach((point) => context.lineTo(point.x, point.y))
  context.closePath()
}

function drawRoundedPolygonPath(context, polygon, radius) {
  const corners = polygon.map((point, index) => {
    const previous = polygon[(index - 1 + polygon.length) % polygon.length]
    const next = polygon[(index + 1) % polygon.length]
    const previousLength = Math.hypot(previous.x - point.x, previous.y - point.y)
    const nextLength = Math.hypot(next.x - point.x, next.y - point.y)
    const cornerRadius = Math.min(radius, previousLength * 0.22, nextLength * 0.22)
    const towardPrevious = normalizeVector({ x: previous.x - point.x, y: previous.y - point.y })
    const towardNext = normalizeVector({ x: next.x - point.x, y: next.y - point.y })
    return {
      point,
      incoming: { x: point.x + towardPrevious.x * cornerRadius, y: point.y + towardPrevious.y * cornerRadius },
      outgoing: { x: point.x + towardNext.x * cornerRadius, y: point.y + towardNext.y * cornerRadius },
    }
  })

  context.beginPath()
  context.moveTo(corners[0].outgoing.x, corners[0].outgoing.y)
  for (let step = 1; step <= corners.length; step += 1) {
    const corner = corners[step % corners.length]
    context.lineTo(corner.incoming.x, corner.incoming.y)
    context.quadraticCurveTo(corner.point.x, corner.point.y, corner.outgoing.x, corner.outgoing.y)
  }
  context.closePath()
}

function drawTaperedSection(context, start, end, direction, startWidth, endWidth, fill) {
  const perpendicular = { x: -direction.y, y: direction.x }
  context.fillStyle = fill
  context.beginPath()
  context.moveTo(start.x + perpendicular.x * startWidth, start.y + perpendicular.y * startWidth)
  context.lineTo(end.x + perpendicular.x * endWidth, end.y + perpendicular.y * endWidth)
  context.lineTo(end.x - perpendicular.x * endWidth, end.y - perpendicular.y * endWidth)
  context.lineTo(start.x - perpendicular.x * startWidth, start.y - perpendicular.y * startWidth)
  context.closePath()
  context.fill()
}

function clearCue(cueCanvas) {
  cueCanvas.getContext('2d').clearRect(0, 0, cueCanvas.width, cueCanvas.height)
}

function drawCue(cueCanvas, tableCanvas, ball, direction, radius, length) {
  const context = cueCanvas.getContext('2d')
  const cueRect = cueCanvas.getBoundingClientRect()
  const tableRect = tableCanvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  cueCanvas.width = Math.round(cueRect.width * dpr)
  cueCanvas.height = Math.round(cueRect.height * dpr)
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, cueRect.width, cueRect.height)

  const offset = { x: tableRect.left - cueRect.left, y: tableRect.top - cueRect.top }
  const cueBall = { x: offset.x + ball.x, y: offset.y + ball.y }
  const tipDistance = radius + 6
  const tip = { x: cueBall.x - direction.x * tipDistance, y: cueBall.y - direction.y * tipDistance }
  const ferrule = { x: tip.x - direction.x * 8, y: tip.y - direction.y * 8 }
  const joint = { x: cueBall.x - direction.x * (length * 0.7 + radius), y: cueBall.y - direction.y * (length * 0.7 + radius) }
  const butt = { x: cueBall.x - direction.x * (length + radius), y: cueBall.y - direction.y * (length + radius) }

  context.save()
  context.shadowColor = '#00000055'
  context.shadowBlur = 4
  context.shadowOffsetY = 2
  drawTaperedSection(context, joint, butt, direction, 5.2, 6.2, '#263139')
  drawTaperedSection(context, ferrule, joint, direction, 2.7, 5.2, '#e8bc87')
  drawTaperedSection(context, tip, ferrule, direction, 2.4, 2.7, '#ece7da')
  const tipEnd = { x: tip.x + direction.x * 5, y: tip.y + direction.y * 5 }
  drawTaperedSection(context, tipEnd, tip, direction, 2.2, 2.4, '#75a8c2')
  context.restore()
}

function drawTable(canvas, cueCanvas, shot, shape, bounces, showTrace, mode, selectedPoint) {
  const context = canvas.getContext('2d')
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  context.setTransform(dpr, 0, 0, dpr, 0, 0)

  const { width, height } = rect
  const polygon = shape.map((point) => ({ x: point.x * width, y: point.y * height }))
  const center = polygonCenter(polygon)
  const ballRadius = Math.max(9, Math.min(width * 0.014, 16))
  const woodWidth = Math.max(10, Math.min(width * 0.014, 17))
  const railWidth = Math.max(7, Math.min(width * 0.009, 11))
  const outerRadius = Math.max(5, Math.min(width * 0.008, 10))
  const railPolygon = insetPolygon(polygon, woodWidth)
  const collisionPolygon = insetPolygon(polygon, woodWidth + railWidth)
  const ball = { x: shot.ball.x * width, y: shot.ball.y * height }
  const aim = { x: shot.aim.x * width, y: shot.aim.y * height }
  const direction = normalizeVector({ x: aim.x - ball.x, y: aim.y - ball.y })
  const distance = Math.hypot(aim.x - ball.x, aim.y - ball.y)
  const path = pointInPolygon(ball, collisionPolygon) ? getPath(ball, direction, bounces, collisionPolygon) : [ball]

  context.clearRect(0, 0, width, height)
  context.save()
  context.lineJoin = 'round'
  context.lineCap = 'round'

  context.save()
  context.translate(7, 9)
  drawRoundedPolygonPath(context, polygon, outerRadius)
  context.fillStyle = '#1b0d09'
  context.fill()
  context.restore()

  drawRoundedPolygonPath(context, polygon, outerRadius)
  context.fillStyle = '#573729'
  context.fill()

  drawPolygonPath(context, railPolygon)
  context.fillStyle = '#218354'
  context.fill()

  drawPolygonPath(context, collisionPolygon)
  context.fillStyle = '#17643f'
  context.fill()

  context.save()
  drawPolygonPath(context, collisionPolygon)
  context.clip()
  const cornerShade = context.createRadialGradient(center.x, center.y, Math.min(width, height) * 0.2, center.x, center.y, Math.hypot(width, height) * 0.48)
  cornerShade.addColorStop(0.48, 'rgba(5, 24, 15, 0)')
  cornerShade.addColorStop(1, 'rgba(5, 18, 12, 0.24)')
  context.fillStyle = cornerShade
  context.fillRect(0, 0, width, height)
  context.restore()

  if (mode === 'play' && showTrace && distance > 5) {
    context.save()
    context.setLineDash([7, 8])
    context.lineWidth = 1.5
    context.strokeStyle = '#eee5cf'
    context.beginPath()
    context.moveTo(path[0].x, path[0].y)
    path.slice(1).forEach((point) => context.lineTo(point.x, point.y))
    context.stroke()
    context.setLineDash([])
    path.slice(1, -1).forEach((point) => {
      context.fillStyle = '#e2bd63'
      context.strokeStyle = '#583d29'
      context.lineWidth = 1
      context.beginPath()
      context.arc(point.x, point.y, 3.2, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    })
    context.restore()
  }

  const gradient = context.createRadialGradient(ball.x - ballRadius * 0.3, ball.y - ballRadius * 0.38, ballRadius * 0.1, ball.x, ball.y, ballRadius)
  gradient.addColorStop(0, '#ffffff')
  gradient.addColorStop(0.7, '#ebe9e2')
  gradient.addColorStop(1, '#c8c9c4')
  context.fillStyle = gradient
  context.beginPath()
  context.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = '#ffffff80'
  context.lineWidth = 1
  context.stroke()

  if (mode === 'edit') {
    polygon.forEach((point, index) => {
      context.beginPath()
      context.arc(point.x, point.y, index === selectedPoint ? 8 : 6, 0, Math.PI * 2)
      context.fillStyle = index === selectedPoint ? '#dce7ea' : '#a9bbc1'
      context.fill()
      context.strokeStyle = '#10191d'
      context.lineWidth = index === selectedPoint ? 3 : 2
      context.stroke()
    })
    clearCue(cueCanvas)
  } else {
    drawCue(cueCanvas, canvas, ball, direction, ballRadius, Math.max(170, Math.min(width * 0.4, 440)))
  }

  context.restore()
  return Math.max(0, path.length - 2)
}

export default function App() {
  const canvasRef = useRef(null)
  const cueCanvasRef = useRef(null)
  const dragRef = useRef(null)
  const [shot, setShot] = useState(initialShot)
  const [shape, setShape] = useState(initialShape)
  const [mode, setMode] = useState('play')
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [bounces, setBounces] = useState(3)
  const [showTrace, setShowTrace] = useState(true)
  const [hintVisible, setHintVisible] = useState(true)
  const [hits, setHits] = useState(3)

  const renderTable = useCallback(() => {
    if (!canvasRef.current || !cueCanvasRef.current) return
    setHits(drawTable(canvasRef.current, cueCanvasRef.current, shot, shape, bounces, showTrace, mode, selectedPoint))
  }, [shot, shape, bounces, showTrace, mode, selectedPoint])

  useEffect(() => {
    renderTable()
    window.addEventListener('resize', renderTable)
    return () => window.removeEventListener('resize', renderTable)
  }, [renderTable])

  function normalizeEvent(event) {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      normalized: { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height },
      pixels: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      rect,
    }
  }

  function safePoint(point) {
    return { x: Math.max(0.035, Math.min(0.965, point.x)), y: Math.max(0.055, Math.min(0.945, point.y)) }
  }

  function updatePointer(event) {
    const { normalized } = normalizeEvent(event)
    const safe = safePoint(normalized)
    if (dragRef.current?.type === 'vertex') {
      setShape((current) => current.map((point, index) => index === dragRef.current.index ? safe : point))
      return
    }
    setShot((current) => dragRef.current?.type === 'ball' ? { ...current, ball: safe } : { ...current, aim: safe })
  }

  function onPointerDown(event) {
    const { normalized, pixels, rect } = normalizeEvent(event)
    canvasRef.current.setPointerCapture(event.pointerId)
    setHintVisible(false)

    if (mode === 'edit') {
      const pixelShape = shape.map((point) => ({ x: point.x * rect.width, y: point.y * rect.height }))
      let vertexIndex = -1
      let vertexDistance = 22
      pixelShape.forEach((point, index) => {
        const distance = Math.hypot(point.x - pixels.x, point.y - pixels.y)
        if (distance < vertexDistance) {
          vertexDistance = distance
          vertexIndex = index
        }
      })

      if (vertexIndex >= 0) {
        dragRef.current = { type: 'vertex', index: vertexIndex }
        setSelectedPoint(vertexIndex)
        return
      }

      let nearestEdge = null
      pixelShape.forEach((start, index) => {
        const end = pixelShape[(index + 1) % pixelShape.length]
        const candidate = nearestPointOnSegment(pixels, start, end)
        if (candidate.distance <= 20 && (!nearestEdge || candidate.distance < nearestEdge.distance)) nearestEdge = { ...candidate, index }
      })

      if (nearestEdge) {
        const inserted = safePoint({ x: nearestEdge.point.x / rect.width, y: nearestEdge.point.y / rect.height })
        const newIndex = nearestEdge.index + 1
        setShape((current) => [...current.slice(0, newIndex), inserted, ...current.slice(newIndex)])
        setSelectedPoint(newIndex)
        dragRef.current = { type: 'vertex', index: newIndex }
      } else {
        setSelectedPoint(null)
      }
      return
    }

    const dx = normalized.x - shot.ball.x
    const dy = normalized.y - shot.ball.y
    const threshold = Math.max(18 / rect.width, 18 / rect.height)
    dragRef.current = { type: Math.hypot(dx, dy) < threshold ? 'ball' : 'aim' }
    updatePointer(event)
  }

  function finishPointer() {
    dragRef.current = null
    if (!pointInPolygon(shot.ball, shape)) setShot((current) => ({ ...current, ball: polygonCenter(shape) }))
  }

  function resetAll() {
    setShot(initialShot)
    setShape(initialShape)
    setBounces(3)
    setSelectedPoint(null)
  }

  function removeSelectedPoint() {
    if (selectedPoint === null || shape.length <= 3) return
    setShape((current) => current.filter((_, index) => index !== selectedPoint))
    setSelectedPoint(null)
  }

  function applyPreset(preset) {
    setShape(preset.shape.map((point) => ({ ...point })))
    setShot((current) => pointInPolygon(current.ball, preset.shape) ? current : { ...current, ball: polygonCenter(preset.shape) })
    setSelectedPoint(null)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={resetAll} aria-label="innerbilliards, reiniciar mesa"><span>inner</span>billiards<i /></button>
        <button className="reset-button" onClick={resetAll}>Reiniciar</button>
      </header>

      <section className="playground" aria-label="Mesa de bilhar interativa">
        <div className="table-wrap">
          <canvas
            ref={canvasRef}
            className={mode === 'edit' ? 'editing' : ''}
            aria-label={mode === 'edit' ? 'Editor do formato da mesa' : 'Arraste a bola branca ou arraste a mesa para mirar'}
            onPointerDown={onPointerDown}
            onPointerMove={(event) => dragRef.current && updatePointer(event)}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
          />
          <canvas ref={cueCanvasRef} className="cue-canvas" aria-hidden="true" />
          {hintVisible && <div className="hint visible">{mode === 'edit' ? 'Arraste um ponto da borda' : 'Arraste a bola ou mire na mesa'}</div>}
        </div>
      </section>

      <footer className="controls">
        <div className="mode-control" role="group" aria-label="Modo da mesa">
          <button aria-pressed={mode === 'play'} onClick={() => { setMode('play'); setSelectedPoint(null); setHintVisible(false) }}>Trajetória</button>
          <button aria-pressed={mode === 'edit'} onClick={() => { setMode('edit'); setHintVisible(false) }}>Editar mesa</button>
        </div>

        {mode === 'play' ? (
          <>
            <div className="control-group"><span className="control-label">Reflexões</span><div className="stepper"><button onClick={() => setBounces((value) => Math.max(0, value - 1))} aria-label="Diminuir reflexões">−</button><output>{bounces}</output><button onClick={() => setBounces((value) => value + 1)} aria-label="Aumentar reflexões">+</button></div></div>
            <label className="switch-row"><span className="control-label">Rastro</span><input type="checkbox" checked={showTrace} onChange={(event) => setShowTrace(event.target.checked)} /><span className="switch" /></label>
            <p className="status">{hits} {hits === 1 ? 'quique' : 'quiques'}</p>
          </>
        ) : (
          <>
            <div className="preset-picker" role="group" aria-label="Formatos prontos">
              {shapePresets.map((preset) => (
                <button className="preset-button" key={preset.id} onClick={() => applyPreset(preset)} aria-label={preset.label} title={preset.label}>
                  <span className={`preset-shape ${preset.id}`} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button className="tool-button" onClick={removeSelectedPoint} disabled={selectedPoint === null || shape.length <= 3}>Remover ponto</button>
            <p className="edit-help">Arraste os pontos · clique numa borda para adicionar</p>
          </>
        )}
      </footer>
    </main>
  )
}
