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
const ellipseShape = [
  { x: 0.945, y: 0.5, in: { x: 0.945, y: 0.271 }, out: { x: 0.945, y: 0.729 } },
  { x: 0.5, y: 0.915, in: { x: 0.746, y: 0.915 }, out: { x: 0.254, y: 0.915 } },
  { x: 0.055, y: 0.5, in: { x: 0.055, y: 0.729 }, out: { x: 0.055, y: 0.271 } },
  { x: 0.5, y: 0.085, in: { x: 0.254, y: 0.085 }, out: { x: 0.746, y: 0.085 } },
]
const triangleShape = [
  { x: 0.5, y: 0.075 },
  { x: 0.945, y: 0.915 },
  { x: 0.055, y: 0.915 },
]
const octagonShape = [
  { x: 0.18, y: 0.085 },
  { x: 0.82, y: 0.085 },
  { x: 0.945, y: 0.25 },
  { x: 0.945, y: 0.75 },
  { x: 0.82, y: 0.915 },
  { x: 0.18, y: 0.915 },
  { x: 0.055, y: 0.75 },
  { x: 0.055, y: 0.25 },
]
const stadiumShape = [
  { x: 0.2, y: 0.085, in: { x: 0.02, y: 0.085 } },
  { x: 0.8, y: 0.085, out: { x: 0.98, y: 0.085 } },
  { x: 0.8, y: 0.915, in: { x: 0.98, y: 0.915 } },
  { x: 0.2, y: 0.915, out: { x: 0.02, y: 0.915 } },
]
const shapePresets = [
  { id: 'rectangle', label: 'Retângulo', shape: initialShape },
  { id: 'triangle', label: 'Triângulo', shape: triangleShape },
  { id: 'hexagon', label: 'Hexágono', shape: hexagonShape },
  { id: 'octagon', label: 'Octógono', shape: octagonShape },
  { id: 'ellipse', label: 'Elipse', shape: ellipseShape },
  { id: 'stadium', label: 'Estádio', shape: stadiumShape },
]

const cross = (a, b) => a.x * b.y - a.y * b.x
const dot = (a, b) => a.x * b.x + a.y * b.y

function canvasSpace(width, height) {
  const shapeHeight = Math.min(height, width / 2)
  return {
    shapeHeight,
    toPixels: (point) => ({ x: point.x * width, y: height / 2 + (point.y - 0.5) * shapeHeight }),
    fromPixels: (point) => ({ x: point.x / width, y: 0.5 + (point.y - height / 2) / shapeHeight }),
  }
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1
  return { x: vector.x / length, y: vector.y / length }
}

function polygonCenter(points) {
  return points.reduce((center, point) => ({ x: center.x + point.x / points.length, y: center.y + point.y / points.length }), { x: 0, y: 0 })
}

function cubicPoint(start, controlA, controlB, end, time) {
  const inverse = 1 - time
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * time * controlA.x + 3 * inverse * time ** 2 * controlB.x + time ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * time * controlA.y + 3 * inverse * time ** 2 * controlB.y + time ** 3 * end.y,
  }
}

function cubicDerivative(start, controlA, controlB, end, time) {
  const inverse = 1 - time
  return {
    x: 3 * inverse ** 2 * (controlA.x - start.x) + 6 * inverse * time * (controlB.x - controlA.x) + 3 * time ** 2 * (end.x - controlB.x),
    y: 3 * inverse ** 2 * (controlA.y - start.y) + 6 * inverse * time * (controlB.y - controlA.y) + 3 * time ** 2 * (end.y - controlB.y),
  }
}

function isSmoothNode(shape, index) {
  const point = shape[index]
  const previous = shape[(index - 1 + shape.length) % shape.length]
  const next = shape[(index + 1) % shape.length]
  const incoming = point.in
    ? { x: point.x - point.in.x, y: point.y - point.in.y }
    : { x: point.x - previous.x, y: point.y - previous.y }
  const outgoing = point.out
    ? { x: point.out.x - point.x, y: point.out.y - point.y }
    : { x: next.x - point.x, y: next.y - point.y }
  const a = normalizeVector(incoming)
  const b = normalizeVector(outgoing)
  return Math.abs(cross(a, b)) < 0.025 && dot(a, b) > 0.99
}

function sampleShapeDetailed(shape, steps = 48) {
  const sampled = []
  shape.forEach((point, index) => {
    const next = shape[(index + 1) % shape.length]
    sampled.push({
      x: point.x,
      y: point.y,
      nodeIndex: index,
      isNode: true,
      smooth: isSmoothNode(shape, index),
      curveIndex: point.out && next.in ? index : null,
      time: 0,
    })
    if (!point.out || !next.in) return
    for (let step = 1; step < steps; step += 1) {
      sampled.push({
        ...cubicPoint(point, point.out, next.in, next, step / steps),
        isNode: false,
        curveIndex: index,
        time: step / steps,
      })
    }
  })
  return sampled
}

function sampleShape(shape, steps) {
  return sampleShapeDetailed(shape, steps).map(({ x, y }) => ({ x, y }))
}

function smoothShape(shape) {
  return shape.map((point, index) => {
    const previous = shape[(index - 1 + shape.length) % shape.length]
    const next = shape[(index + 1) % shape.length]
    const tangent = normalizeVector({ x: next.x - previous.x, y: next.y - previous.y })
    const handleLength = Math.min(
      Math.hypot(point.x - previous.x, point.y - previous.y),
      Math.hypot(next.x - point.x, next.y - point.y),
    ) * 0.22
    return {
      ...point,
      in: { x: point.x - tangent.x * handleLength, y: point.y - tangent.y * handleLength },
      out: { x: point.x + tangent.x * handleLength, y: point.y + tangent.y * handleLength },
    }
  })
}

function cloneShape(shape) {
  return shape.map((point) => ({
    ...point,
    in: point.in ? { ...point.in } : undefined,
    out: point.out ? { ...point.out } : undefined,
  }))
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

function getPath(start, direction, bounces, polygon, ballRadius, metadata, shape, size) {
  const points = [start]
  const impacts = []
  let terminatedAtCorner = false
  let point = { ...start }
  let vector = { ...direction }
  const epsilon = 0.05
  const signedArea = polygon.reduce((area, vertex, index) => {
    const next = polygon[(index + 1) % polygon.length]
    return area + vertex.x * next.y - next.x * vertex.y
  }, 0)
  const inwardSide = signedArea >= 0 ? 1 : -1

  for (let bounce = 0; bounce <= bounces; bounce += 1) {
    const candidates = []

    polygon.forEach((edgeStart, index) => {
      const edgeEnd = polygon[(index + 1) % polygon.length]
      const segment = { x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y }
      const denominator = cross(vector, segment)
      if (Math.abs(denominator) < 0.000001) return

      const offset = { x: edgeStart.x - point.x, y: edgeStart.y - point.y }
      const time = cross(offset, segment) / denominator
      const position = cross(offset, vector) / denominator
      if (time > epsilon && position >= -0.0001 && position <= 1.0001) {
        const startMeta = metadata?.[index]
        const endMeta = metadata?.[(index + 1) % metadata.length]
        let inwardNormal = normalizeVector({ x: -segment.y * inwardSide, y: segment.x * inwardSide })

        if (startMeta?.curveIndex !== null && startMeta?.curveIndex !== undefined) {
          const curveStart = shape[startMeta.curveIndex]
          const curveEnd = shape[(startMeta.curveIndex + 1) % shape.length]
          const endTime = endMeta?.curveIndex === startMeta.curveIndex ? endMeta.time : 1
          const curveTime = startMeta.time + (endTime - startMeta.time) * Math.max(0, Math.min(1, position))
          const tangent = cubicDerivative(curveStart, curveStart.out, curveEnd.in, curveEnd, curveTime)
          const pixelTangent = { x: tangent.x * size.width, y: tangent.y * size.height }
          inwardNormal = normalizeVector({ x: -pixelTangent.y * inwardSide, y: pixelTangent.x * inwardSide })
        }

        const cornerTolerance = 2 / Math.max(1, Math.hypot(segment.x, segment.y))
        const hitsCorner = (
          position <= cornerTolerance && startMeta?.isNode && !startMeta.smooth
        ) || (
          position >= 1 - cornerTolerance && endMeta?.isNode && !endMeta.smooth
        )
        candidates.push({ time, segment, inwardNormal, hitsCorner })
      }
    })

    candidates.sort((a, b) => a.time - b.time)
    const nearestHit = candidates[0]
    if (!nearestHit) break
    nearestHit.hitsCorner = candidates.some((candidate) => candidate.time - nearestHit.time < 2 && candidate.hitsCorner)
    const hitPoint = { x: point.x + vector.x * nearestHit.time, y: point.y + vector.y * nearestHit.time }
    points.push(hitPoint)
    if (nearestHit.hitsCorner) {
      impacts.push({ ...hitPoint, corner: true })
      terminatedAtCorner = true
      break
    }
    impacts.push({
      x: hitPoint.x - nearestHit.inwardNormal.x * ballRadius,
      y: hitPoint.y - nearestHit.inwardNormal.y * ballRadius,
    })
    if (bounce === bounces) break

    const projection = dot(vector, nearestHit.inwardNormal)
    vector = normalizeVector({
      x: vector.x - 2 * projection * nearestHit.inwardNormal.x,
      y: vector.y - 2 * projection * nearestHit.inwardNormal.y,
    })
    point = { x: hitPoint.x + vector.x * epsilon * 2, y: hitPoint.y + vector.y * epsilon * 2 }
  }

  return { points, impacts, terminatedAtCorner }
}

function rayEllipseHit(point, vector, ellipse) {
  const offsetX = point.x - ellipse.x
  const offsetY = point.y - ellipse.y
  const radiusXSquared = ellipse.radiusX ** 2
  const radiusYSquared = ellipse.radiusY ** 2
  const a = vector.x ** 2 / radiusXSquared + vector.y ** 2 / radiusYSquared
  const b = 2 * (offsetX * vector.x / radiusXSquared + offsetY * vector.y / radiusYSquared)
  const c = offsetX ** 2 / radiusXSquared + offsetY ** 2 / radiusYSquared - 1
  const discriminant = b ** 2 - 4 * a * c
  if (discriminant < 0) return null
  const root = Math.sqrt(discriminant)
  const times = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter((time) => time > 0.05)
  if (!times.length) return null
  const time = Math.min(...times)
  return { time, point: { x: point.x + vector.x * time, y: point.y + vector.y * time } }
}

function getEllipsePath(start, direction, bounces, collisionEllipse, feltEllipse) {
  const points = [start]
  const impacts = []
  let point = { ...start }
  let vector = { ...direction }

  for (let bounce = 0; bounce <= bounces; bounce += 1) {
    const hit = rayEllipseHit(point, vector, collisionEllipse)
    if (!hit) break
    const outwardNormal = normalizeVector({
      x: (hit.point.x - collisionEllipse.x) / collisionEllipse.radiusX ** 2,
      y: (hit.point.y - collisionEllipse.y) / collisionEllipse.radiusY ** 2,
    })
    const contact = rayEllipseHit(hit.point, outwardNormal, feltEllipse)?.point || hit.point
    points.push(hit.point)
    impacts.push(contact)
    if (bounce === bounces) break

    const projection = dot(vector, outwardNormal)
    vector = normalizeVector({
      x: vector.x - 2 * projection * outwardNormal.x,
      y: vector.y - 2 * projection * outwardNormal.y,
    })
    point = { x: hit.point.x + vector.x * 0.1, y: hit.point.y + vector.y * 0.1 }
  }

  return { points, impacts, terminatedAtCorner: false }
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

function pointAlongPath(path, progress) {
  if (path.length < 2 || progress <= 0) return path[0]
  const lengths = path.slice(1).map((point, index) => Math.hypot(point.x - path[index].x, point.y - path[index].y))
  const totalLength = lengths.reduce((sum, length) => sum + length, 0)
  let remaining = totalLength * Math.min(1, progress)

  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index]) {
      const amount = lengths[index] ? remaining / lengths[index] : 0
      return {
        x: path[index].x + (path[index + 1].x - path[index].x) * amount,
        y: path[index].y + (path[index + 1].y - path[index].y) * amount,
      }
    }
    remaining -= lengths[index]
  }
  return path[path.length - 1]
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

function drawTable(canvas, cueCanvas, shot, shape, bounces, showTrace, mode, selectedPoint, animationProgress, geometryId) {
  const context = canvas.getContext('2d')
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  context.setTransform(dpr, 0, 0, dpr, 0, 0)

  const { width, height } = rect
  const space = canvasSpace(width, height)
  const sampledShape = sampleShapeDetailed(shape)
  const polygon = sampledShape.map(space.toPixels)
  const hasCurves = shape.some((point) => point.in || point.out)
  const center = polygonCenter(polygon)
  const ballRadius = Math.max(9, Math.min(width * 0.014, 16))
  const woodWidth = Math.max(10, Math.min(width * 0.014, 17))
  const railWidth = Math.max(7, Math.min(width * 0.009, 11))
  const outerRadius = Math.max(5, Math.min(width * 0.008, 10))
  const railPolygon = insetPolygon(polygon, woodWidth)
  const feltPolygon = insetPolygon(polygon, woodWidth + railWidth)
  const collisionPolygon = insetPolygon(polygon, woodWidth + railWidth + ballRadius)
  const ball = space.toPixels(shot.ball)
  const aim = space.toPixels(shot.aim)
  const direction = normalizeVector({ x: aim.x - ball.x, y: aim.y - ball.y })
  const distance = Math.hypot(aim.x - ball.x, aim.y - ball.y)
  let trajectory = { points: [ball], impacts: [], terminatedAtCorner: false }
  if (pointInPolygon(ball, collisionPolygon)) {
    if (geometryId === 'ellipse') {
      const outerRadiusX = (Math.max(...polygon.map((point) => point.x)) - Math.min(...polygon.map((point) => point.x))) / 2
      const outerRadiusY = (Math.max(...polygon.map((point) => point.y)) - Math.min(...polygon.map((point) => point.y))) / 2
      const feltEllipse = {
        x: center.x,
        y: center.y,
        radiusX: outerRadiusX - woodWidth - railWidth,
        radiusY: outerRadiusY - woodWidth - railWidth,
      }
      const collisionEllipse = {
        ...feltEllipse,
        radiusX: feltEllipse.radiusX - ballRadius,
        radiusY: feltEllipse.radiusY - ballRadius,
      }
      trajectory = getEllipsePath(ball, direction, bounces, collisionEllipse, feltEllipse)
    } else {
      trajectory = getPath(ball, direction, bounces, collisionPolygon, ballRadius, sampledShape, shape, { width, height: space.shapeHeight })
    }
  }
  const path = trajectory.points
  const animatedBall = pointAlongPath(path, animationProgress)
  const pathLength = path.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - path[index].x, point.y - path[index].y), 0)
  let traveled = 0
  const impactProgresses = path.slice(1).map((point, index) => {
    traveled += Math.hypot(point.x - path[index].x, point.y - path[index].y)
    return pathLength > 0 ? traveled / pathLength : 0
  })

  context.clearRect(0, 0, width, height)
  context.save()
  context.lineJoin = 'round'
  context.lineCap = 'round'

  context.save()
  context.translate(7, 9)
  if (hasCurves) drawPolygonPath(context, polygon)
  else drawRoundedPolygonPath(context, polygon, outerRadius)
  context.fillStyle = '#1b0d09'
  context.fill()
  context.restore()

  if (hasCurves) drawPolygonPath(context, polygon)
  else drawRoundedPolygonPath(context, polygon, outerRadius)
  context.fillStyle = '#573729'
  context.fill()

  drawPolygonPath(context, railPolygon)
  context.fillStyle = '#218354'
  context.fill()

  drawPolygonPath(context, feltPolygon)
  context.fillStyle = '#17643f'
  context.fill()

  context.save()
  drawPolygonPath(context, feltPolygon)
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
    trajectory.impacts.slice(0, -1).forEach((point, index) => {
      const ballCenter = path[index + 1]
      context.strokeStyle = '#dce7ea70'
      context.lineWidth = 1
      context.beginPath()
      context.arc(ballCenter.x, ballCenter.y, ballRadius, 0, Math.PI * 2)
      context.stroke()

      context.strokeStyle = '#e2bd6370'
      context.beginPath()
      context.moveTo(ballCenter.x, ballCenter.y)
      context.lineTo(point.x, point.y)
      context.stroke()

      context.fillStyle = '#e2bd63'
      context.strokeStyle = '#583d29'
      context.lineWidth = 1
      context.beginPath()
      context.arc(point.x, point.y, 3.2, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    })
    if (trajectory.terminatedAtCorner) {
      const corner = trajectory.impacts[trajectory.impacts.length - 1]
      context.fillStyle = '#d64045'
      context.strokeStyle = '#10191d'
      context.lineWidth = 1.5
      context.beginPath()
      context.arc(corner.x, corner.y, 4.5, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
    context.restore()
  }

  const gradient = context.createRadialGradient(animatedBall.x - ballRadius * 0.3, animatedBall.y - ballRadius * 0.38, ballRadius * 0.1, animatedBall.x, animatedBall.y, ballRadius)
  gradient.addColorStop(0, '#ffffff')
  gradient.addColorStop(0.7, '#ebe9e2')
  gradient.addColorStop(1, '#c8c9c4')
  context.fillStyle = gradient
  context.beginPath()
  context.arc(animatedBall.x, animatedBall.y, ballRadius, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = '#ffffff80'
  context.lineWidth = 1
  context.stroke()

  if (mode === 'edit') {
    const editablePoints = shape.map(space.toPixels)
    const selected = selectedPoint === null ? null : shape[selectedPoint]
    if (selected?.in || selected?.out) {
      const selectedPosition = editablePoints[selectedPoint]
      const handles = [
        selected.in && space.toPixels(selected.in),
        selected.out && space.toPixels(selected.out),
      ].filter(Boolean)
      context.save()
      context.strokeStyle = '#dce7eaaa'
      context.lineWidth = 1
      handles.forEach((handle) => {
        context.beginPath()
        context.moveTo(selectedPosition.x, selectedPosition.y)
        context.lineTo(handle.x, handle.y)
        context.stroke()
        context.beginPath()
        context.arc(handle.x, handle.y, 4.5, 0, Math.PI * 2)
        context.fillStyle = '#10191d'
        context.fill()
        context.strokeStyle = '#dce7ea'
        context.lineWidth = 2
        context.stroke()
      })
      context.restore()
    }

    editablePoints.forEach((point, index) => {
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
    if (animationProgress === 0) drawCue(cueCanvas, canvas, ball, direction, ballRadius, Math.max(170, Math.min(width * 0.4, 440)))
    else clearCue(cueCanvas)
  }

  context.restore()
  return { hits: Math.max(0, path.length - 2), pathLength, impactProgresses, terminatedAtCorner: trajectory.terminatedAtCorner }
}

export default function App() {
  const canvasRef = useRef(null)
  const cueCanvasRef = useRef(null)
  const dragRef = useRef(null)
  const audioRef = useRef(null)
  const mutedRef = useRef(false)
  const impactProgressesRef = useRef([])
  const [shot, setShot] = useState(initialShot)
  const [shape, setShape] = useState(initialShape)
  const [geometryId, setGeometryId] = useState('rectangle')
  const [mode, setMode] = useState('play')
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [bounces, setBounces] = useState(3)
  const [showTrace, setShowTrace] = useState(true)
  const [hintVisible, setHintVisible] = useState(true)
  const [hits, setHits] = useState(3)
  const [pathLength, setPathLength] = useState(0)
  const [animationProgress, setAnimationProgress] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [terminatedAtCorner, setTerminatedAtCorner] = useState(false)

  const renderTable = useCallback(() => {
    if (!canvasRef.current || !cueCanvasRef.current) return
    const result = drawTable(canvasRef.current, cueCanvasRef.current, shot, shape, bounces, showTrace, mode, selectedPoint, animationProgress, geometryId)
    setHits(result.hits)
    setPathLength(result.pathLength)
    impactProgressesRef.current = result.impactProgresses
    setTerminatedAtCorner(result.terminatedAtCorner)
  }, [shot, shape, bounces, showTrace, mode, selectedPoint, animationProgress, geometryId])

  useEffect(() => {
    renderTable()
    const observer = new ResizeObserver(renderTable)
    observer.observe(canvasRef.current)
    window.addEventListener('resize', renderTable)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', renderTable)
    }
  }, [renderTable])

  useEffect(() => {
    setIsPlaying(false)
    setAnimationProgress(0)
  }, [shot, shape, bounces, mode])

  useEffect(() => () => {
    audioRef.current?.close()
  }, [])

  function playImpact() {
    const audio = audioRef.current
    if (mutedRef.current || !audio || audio.state !== 'running') return
    const now = audio.currentTime
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(115, now)
    oscillator.frequency.exponentialRampToValueAtTime(68, now + 0.09)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11)
    oscillator.connect(gain)
    gain.connect(audio.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.12)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }
  }

  useEffect(() => {
    if (!isPlaying || pathLength <= 0) return undefined
    let frame
    let startedAt
    const startingProgress = animationProgress >= 1 ? 0 : animationProgress
    const duration = (Math.max(1800, pathLength * 4.5) * (1 - startingProgress)) / playbackSpeed
    const impacts = impactProgressesRef.current.filter((progress) => progress > startingProgress + 0.0001)
    let nextImpact = 0

    function animate(time) {
      if (!startedAt) startedAt = time
      const linearProgress = Math.min(1, (time - startedAt) / duration)
      const easedProgress = 1 - (1 - linearProgress) ** 2
      const progress = startingProgress + (1 - startingProgress) * easedProgress
      while (nextImpact < impacts.length && progress >= impacts[nextImpact]) {
        playImpact()
        nextImpact += 1
      }
      setAnimationProgress(progress)
      if (linearProgress < 1) frame = requestAnimationFrame(animate)
      else setIsPlaying(false)
    }

    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying, playbackSpeed, pathLength])

  function normalizeEvent(event) {
    const rect = canvasRef.current.getBoundingClientRect()
    const pixels = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    return {
      normalized: canvasSpace(rect.width, rect.height).fromPixels(pixels),
      pixels,
      rect,
    }
  }

  function safePoint(point, rect) {
    const space = canvasSpace(rect.width, rect.height)
    const top = space.fromPixels({ x: 0, y: 16 }).y
    const bottom = space.fromPixels({ x: 0, y: rect.height - 16 }).y
    return { x: Math.max(0.035, Math.min(0.965, point.x)), y: Math.max(top, Math.min(bottom, point.y)) }
  }

  function updatePointer(event) {
    const { normalized, rect } = normalizeEvent(event)
    const safe = safePoint(normalized, rect)
    if (dragRef.current?.type === 'vertex') {
      setGeometryId('custom')
      setShape((current) => current.map((point, index) => {
        if (index !== dragRef.current.index) return point
        const movement = { x: safe.x - point.x, y: safe.y - point.y }
        return {
          ...point,
          ...safe,
          in: point.in ? { x: point.in.x + movement.x, y: point.in.y + movement.y } : undefined,
          out: point.out ? { x: point.out.x + movement.x, y: point.out.y + movement.y } : undefined,
        }
      }))
      return
    }
    if (dragRef.current?.type === 'handle') {
      setGeometryId('custom')
      setShape((current) => current.map((point, index) => index === dragRef.current.index
        ? { ...point, [dragRef.current.handle]: safe }
        : point))
      return
    }
    setShot((current) => dragRef.current?.type === 'ball' ? { ...current, ball: safe } : { ...current, aim: safe })
  }

  function onPointerDown(event) {
    const { pixels, rect } = normalizeEvent(event)
    canvasRef.current.setPointerCapture(event.pointerId)
    setHintVisible(false)

    if (mode === 'edit') {
      const space = canvasSpace(rect.width, rect.height)
      const pixelShape = shape.map(space.toPixels)
      const selected = selectedPoint === null ? null : shape[selectedPoint]
      if (selected?.in || selected?.out) {
        const handles = [
          selected.in && { name: 'in', point: space.toPixels(selected.in) },
          selected.out && { name: 'out', point: space.toPixels(selected.out) },
        ].filter(Boolean)
        const handle = handles.find((candidate) => Math.hypot(candidate.point.x - pixels.x, candidate.point.y - pixels.y) < 18)
        if (handle) {
          dragRef.current = { type: 'handle', index: selectedPoint, handle: handle.name }
          return
        }
      }
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
        const inserted = safePoint(space.fromPixels(nearestEdge.point), rect)
        const newIndex = nearestEdge.index + 1
        setGeometryId('custom')
        setShape((current) => [...current.slice(0, newIndex), inserted, ...current.slice(newIndex)])
        setSelectedPoint(newIndex)
        dragRef.current = { type: 'vertex', index: newIndex }
      } else {
        setSelectedPoint(null)
      }
      return
    }

    const ball = canvasSpace(rect.width, rect.height).toPixels(shot.ball)
    dragRef.current = { type: Math.hypot(pixels.x - ball.x, pixels.y - ball.y) < 18 ? 'ball' : 'aim' }
    updatePointer(event)
  }

  function finishPointer() {
    dragRef.current = null
    const boundary = sampleShape(shape)
    if (!pointInPolygon(shot.ball, boundary)) setShot((current) => ({ ...current, ball: polygonCenter(boundary) }))
  }

  function resetAll() {
    setShot(initialShot)
    setShape(initialShape)
    setGeometryId('rectangle')
    setBounces(3)
    setSelectedPoint(null)
    setIsPlaying(false)
    setAnimationProgress(0)
  }

  function removeSelectedPoint() {
    if (selectedPoint === null || shape.length <= 3) return
    setGeometryId('custom')
    setShape((current) => current.filter((_, index) => index !== selectedPoint))
    setSelectedPoint(null)
  }

  function applyPreset(preset) {
    const nextShape = cloneShape(preset.shape)
    const boundary = sampleShape(nextShape)
    setShape(nextShape)
    setGeometryId(preset.id)
    setShot((current) => pointInPolygon(current.ball, boundary) ? current : { ...current, ball: polygonCenter(boundary) })
    setSelectedPoint(null)
  }

  function togglePlayback() {
    if (animationProgress >= 1) setAnimationProgress(0)
    setHintVisible(false)
    if (!isPlaying && !mutedRef.current) startAudio()
    setIsPlaying((current) => !current)
  }

  function startAudio() {
    if (audioRef.current?.state === 'closed') audioRef.current = null
    if (!audioRef.current) {
      try {
        audioRef.current = new (window.AudioContext || window.webkitAudioContext)()
      } catch {
        mutedRef.current = true
        setIsMuted(true)
        return
      }
    }
    audioRef.current.resume()
  }

  function toggleMute() {
    mutedRef.current = !mutedRef.current
    setIsMuted(mutedRef.current)
    if (!mutedRef.current && isPlaying) startAudio()
  }

  function toggleCurves() {
    const curved = shape.some((point) => point.in || point.out)
    setGeometryId('custom')
    setShape(curved
      ? shape.map(({ x, y }) => ({ x, y }))
      : smoothShape(shape))
    setSelectedPoint(null)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={resetAll} aria-label="innerbilliards, reiniciar mesa">
          <img className="wordmark-logo" src="/brand/innerbilliards.png" alt="" />
          <span className="wordmark-copy"><strong>inner</strong>billiards<i /></span>
        </button>
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
            <div className="playback-control">
              <button className="play-button" onClick={togglePlayback} aria-label={isPlaying ? 'Pausar animação' : 'Reproduzir trajetória'} title={isPlaying ? 'Pausar' : 'Reproduzir'}>
                <span className={isPlaying ? 'pause-icon' : 'play-icon'} aria-hidden="true" />
              </button>
              <button className="mute-button" onClick={toggleMute} aria-label={isMuted ? 'Ativar som' : 'Silenciar som'} aria-pressed={isMuted} title={isMuted ? 'Ativar som' : 'Silenciar som'}>
                <span className={isMuted ? 'sound-icon muted' : 'sound-icon'} aria-hidden="true" />
              </button>
              <select value={playbackSpeed} onChange={(event) => setPlaybackSpeed(Number(event.target.value))} aria-label="Velocidade da animação">
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </div>
            <div className="control-group"><span className="control-label">Reflexões</span><div className="stepper"><button onClick={() => setBounces((value) => Math.max(0, value - 1))} aria-label="Diminuir reflexões">−</button><output>{bounces}</output><button onClick={() => setBounces((value) => value + 1)} aria-label="Aumentar reflexões">+</button></div></div>
            <label className="switch-row"><span className="control-label">Rastro</span><input type="checkbox" checked={showTrace} onChange={(event) => setShowTrace(event.target.checked)} /><span className="switch" /></label>
            <p className={`status${terminatedAtCorner ? ' corner-stop' : ''}`}>{terminatedAtCorner ? 'vértice' : `${hits} ${hits === 1 ? 'quique' : 'quiques'}`}</p>
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
            <button className="tool-button" onClick={toggleCurves}>{shape.some((point) => point.in || point.out) ? 'Usar retas' : 'Suavizar'}</button>
            <button className="tool-button" onClick={removeSelectedPoint} disabled={selectedPoint === null || shape.length <= 3}>Remover ponto</button>
            <p className="edit-help">Arraste pontos e alças · clique numa borda para adicionar</p>
          </>
        )}
      </footer>
    </main>
  )
}
