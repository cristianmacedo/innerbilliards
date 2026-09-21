const NORMAL_RESTITUTION = 0.88
const TANGENT_RETENTION = 0.97
const REFERENCE_WIDTH_METERS = 2.54
const BALL_MASS_KG = 0.17
const CUE_CONTACT_SECONDS = 0.001

export function bounceVelocity(direction, normal) {
  const normalSpeed = direction.x * normal.x + direction.y * normal.y
  const tangent = {
    x: direction.x - normalSpeed * normal.x,
    y: direction.y - normalSpeed * normal.y,
  }
  const outgoing = {
    x: TANGENT_RETENTION * tangent.x - NORMAL_RESTITUTION * normalSpeed * normal.x,
    y: TANGENT_RETENTION * tangent.y - NORMAL_RESTITUTION * normalSpeed * normal.y,
  }
  const retainedSpeed = Math.hypot(outgoing.x, outgoing.y)
  return {
    direction: { x: outgoing.x / retainedSpeed, y: outgoing.y / retainedSpeed },
    retainedSpeed,
  }
}

export function buildMotion(points, bounceRatios, tableWidth) {
  if (points.length < 2) return { segments: [], duration: 0, impactProgresses: [] }

  const deceleration = tableWidth * 0.12
  const arrivalSpeed = tableWidth * 0.08
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
  const startSpeeds = Array(lengths.length)
  const endSpeeds = Array(lengths.length)
  let requiredEndSpeed = arrivalSpeed

  for (let index = lengths.length - 1; index >= 0; index -= 1) {
    endSpeeds[index] = requiredEndSpeed
    startSpeeds[index] = Math.sqrt(requiredEndSpeed ** 2 + 2 * deceleration * lengths[index])
    if (index > 0) requiredEndSpeed = startSpeeds[index] / bounceRatios[index - 1]
  }

  let elapsed = 0
  const segments = lengths.map((length, index) => {
    const duration = 2 * length / (startSpeeds[index] + endSpeeds[index])
    const segment = {
      start: points[index],
      end: points[index + 1],
      length,
      startSpeed: startSpeeds[index],
      endSpeed: endSpeeds[index],
      startTime: elapsed,
      endTime: elapsed + duration,
    }
    elapsed += duration
    return segment
  })

  return {
    segments,
    duration: elapsed,
    impactProgresses: segments.map((segment) => segment.endTime / elapsed),
    deceleration,
  }
}

export function pointAlongMotion(motion, progress) {
  const { segments, duration, deceleration } = motion
  if (!segments.length) return null
  if (progress <= 0) return segments[0].start
  if (progress >= 1) return segments[segments.length - 1].end

  const time = progress * duration
  const segment = segments.find((part) => time <= part.endTime) || segments[segments.length - 1]
  const localTime = time - segment.startTime
  const distance = segment.startSpeed * localTime - 0.5 * deceleration * localTime ** 2
  const amount = segment.length ? Math.max(0, Math.min(1, distance / segment.length)) : 1
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * amount,
    y: segment.start.y + (segment.end.y - segment.start.y) * amount,
  }
}

export function motionStatistics(motion, tableWidth) {
  if (!motion.segments.length || !tableWidth) return null
  const metersPerPixel = REFERENCE_WIDTH_METERS / tableWidth
  const initialSpeed = motion.segments[0].startSpeed * metersPerPixel
  const finalSpeed = motion.segments[motion.segments.length - 1].endSpeed * metersPerPixel
  return {
    initialSpeed,
    finalSpeed,
    averageCueForce: BALL_MASS_KG * initialSpeed / CUE_CONTACT_SECONDS,
    duration: motion.duration,
  }
}
