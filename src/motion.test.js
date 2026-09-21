import test from 'node:test'
import assert from 'node:assert/strict'
import { bounceVelocity, buildMotion, motionStatistics, pointAlongMotion } from './motion.js'

test('a head-on cushion impact reverses direction and loses speed', () => {
  const result = bounceVelocity({ x: 1, y: 0 }, { x: -1, y: 0 })
  assert.deepEqual(result.direction, { x: -1, y: 0 })
  assert.ok(result.retainedSpeed > 0 && result.retainedSpeed < 1)
})

test('a glancing impact retains more speed than a head-on impact', () => {
  const headOn = bounceVelocity({ x: 1, y: 0 }, { x: -1, y: 0 })
  const glancing = bounceVelocity({ x: 0.2, y: Math.sqrt(0.96) }, { x: -1, y: 0 })
  assert.ok(glancing.retainedSpeed > headOn.retainedSpeed)
  assert.ok(glancing.direction.x < 0)
})

test('motion loses speed at each impact and still reaches the final point', () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 120 }]
  const motion = buildMotion(points, [0.88], 400)
  assert.equal(motion.segments.length, 2)
  assert.ok(motion.segments[0].startSpeed > motion.segments[0].endSpeed)
  assert.ok(motion.segments[1].startSpeed < motion.segments[0].endSpeed)
  assert.ok(Math.abs(motion.segments[1].startSpeed - motion.segments[0].endSpeed * 0.88) < 0.000001)
  assert.ok(motion.segments[1].endSpeed > 0)
  assert.deepEqual(pointAlongMotion(motion, 0), points[0])
  assert.deepEqual(pointAlongMotion(motion, 1), points[2])
  assert.deepEqual(pointAlongMotion(motion, motion.impactProgresses[0]), points[1])
})

test('the ball slows within each segment rather than easing the whole path', () => {
  const motion = buildMotion([{ x: 0, y: 0 }, { x: 200, y: 0 }], [], 400)
  const halfwayInTime = pointAlongMotion(motion, 0.5)
  assert.ok(halfwayInTime.x > 100)
  assert.ok(halfwayInTime.x < 200)
})

test('many reflections still end at the requested impact', () => {
  const points = Array.from({ length: 31 }, (_, index) => ({ x: index * 20, y: index % 2 ? 50 : 0 }))
  const motion = buildMotion(points, Array(29).fill(0.9), 400)
  assert.ok(Number.isFinite(motion.duration))
  assert.equal(motion.impactProgresses.length, 30)
  assert.deepEqual(pointAlongMotion(motion, 1), points[30])
})

test('statistics convert model speed to an estimated cue force', () => {
  const motion = buildMotion([{ x: 0, y: 0 }, { x: 200, y: 0 }], [], 400)
  const stats = motionStatistics(motion, 400)
  assert.ok(Math.abs(stats.initialSpeed - motion.segments[0].startSpeed * 2.54 / 400) < 0.000001)
  assert.ok(Math.abs(stats.averageCueForce - 0.17 * stats.initialSpeed / 0.001) < 0.000001)
  assert.equal(stats.duration, motion.duration)
  assert.equal(motionStatistics({ segments: [] }, 400), null)
})
