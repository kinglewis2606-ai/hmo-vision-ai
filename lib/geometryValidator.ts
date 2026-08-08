import { FloorPlan, Room, WallLine } from "@/lib/types/floorPlan"

export interface GeometryValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function hasPositiveDimensions(room: Room): boolean {
  return room.width > 0 && room.height > 0
}

function getWallSegmentKey(wall: WallLine): string {
  const start: [number, number] = [wall.x1, wall.y1]
  const end: [number, number] = [wall.x2, wall.y2]
  const [first, second] =
    start[0] < end[0] ||
    (start[0] === end[0] && start[1] <= end[1])
      ? [start, end]
      : [end, start]

  return `${first[0]},${first[1]}:${second[0]},${second[1]}`
}

export function validateGeometry(
  floorPlan: FloorPlan | null | undefined
): GeometryValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!floorPlan || typeof floorPlan !== "object") {
    return {
      valid: false,
      errors: ["originalFloorPlan must be an object"],
      warnings,
    }
  }

  if (!Array.isArray(floorPlan.floors)) {
    errors.push("originalFloorPlan.floors must be an array")
  }

  if (!Array.isArray(floorPlan.walls)) {
    errors.push("originalFloorPlan.walls must be an array")
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
    }
  }

  if (floorPlan.floors.length === 0) {
    warnings.push("originalFloorPlan.floors is empty")
  }

  if (floorPlan.walls.length === 0) {
    warnings.push("originalFloorPlan.walls is empty")
  }

  const roomIds = new Set<string>()
  const wallIds = new Set<string>()
  const wallSegments = new Set<string>()
  const floorLevels = new Set<number>()

  floorPlan.floors.forEach((floor, floorIndex) => {
    if (!floor || typeof floor !== "object") {
      errors.push(`floors[${floorIndex}] must be an object`)
      return
    }

    if (!Number.isInteger(floor.level)) {
      errors.push(`floors[${floorIndex}].level must be an integer`)
    } else if (floorLevels.has(floor.level)) {
      errors.push(`Duplicate floor level detected: ${floor.level}`)
    } else {
      floorLevels.add(floor.level)
    }

    if (!Array.isArray(floor.rooms)) {
      errors.push(`floors[${floorIndex}].rooms must be an array`)
      return
    }

    if (floor.rooms.length === 0) {
      warnings.push(`floors[${floorIndex}] has no rooms`)
    }

    floor.rooms.forEach((room, roomIndex) => {
      if (!room || typeof room !== "object") {
        errors.push(`floors[${floorIndex}].rooms[${roomIndex}] must be an object`)
        return
      }

      if (typeof room.id !== "string" || room.id.trim() === "") {
        errors.push(`floors[${floorIndex}].rooms[${roomIndex}].id must be a non-empty string`)
      } else if (roomIds.has(room.id)) {
        errors.push(`Duplicate room id detected: ${room.id}`)
      } else {
        roomIds.add(room.id)
      }

      if (!isFiniteNumber(room.x)) {
        errors.push(`Room ${room.id || `${floorIndex}:${roomIndex}`} has invalid x coordinate`)
      }

      if (!isFiniteNumber(room.y)) {
        errors.push(`Room ${room.id || `${floorIndex}:${roomIndex}`} has invalid y coordinate`)
      }

      if (!isFiniteNumber(room.width)) {
        errors.push(`Room ${room.id || `${floorIndex}:${roomIndex}`} has invalid width`)
      }

      if (!isFiniteNumber(room.height)) {
        errors.push(`Room ${room.id || `${floorIndex}:${roomIndex}`} has invalid height`)
      }

      if (
        isFiniteNumber(room.width) &&
        isFiniteNumber(room.height) &&
        !hasPositiveDimensions(room)
      ) {
        errors.push(`Room ${room.id || `${floorIndex}:${roomIndex}`} must have positive width and height`)
      }

      if (!Array.isArray(room.adjacentRooms)) {
        warnings.push(`Room ${room.id || `${floorIndex}:${roomIndex}`} has a non-array adjacentRooms value`)
      }
    })
  })

  floorPlan.floors.forEach((floor, floorIndex) => {
    if (!Array.isArray(floor.rooms)) {
      return
    }

    floor.rooms.forEach((room, roomIndex) => {
      if (!Array.isArray(room.adjacentRooms)) {
        return
      }

      room.adjacentRooms.forEach(adjacentRoomId => {
        if (!roomIds.has(adjacentRoomId)) {
          warnings.push(
            `Room ${room.id || `${floorIndex}:${roomIndex}`} references unknown adjacent room ${adjacentRoomId}`
          )
        }
      })
    })
  })

  floorPlan.walls.forEach((wall, wallIndex) => {
    if (!wall || typeof wall !== "object") {
      errors.push(`walls[${wallIndex}] must be an object`)
      return
    }

    if (!isFiniteNumber(wall.x1)) {
      errors.push(`walls[${wallIndex}].x1 must be a finite number`)
    }

    if (!isFiniteNumber(wall.y1)) {
      errors.push(`walls[${wallIndex}].y1 must be a finite number`)
    }

    if (!isFiniteNumber(wall.x2)) {
      errors.push(`walls[${wallIndex}].x2 must be a finite number`)
    }

    if (!isFiniteNumber(wall.y2)) {
      errors.push(`walls[${wallIndex}].y2 must be a finite number`)
    }

    if (
      isFiniteNumber(wall.x1) &&
      isFiniteNumber(wall.y1) &&
      isFiniteNumber(wall.x2) &&
      isFiniteNumber(wall.y2)
    ) {
      if (wall.x1 === wall.x2 && wall.y1 === wall.y2) {
        errors.push(`walls[${wallIndex}] must have non-zero length`)
      }

      const segmentKey = getWallSegmentKey(wall)

      if (wallSegments.has(segmentKey)) {
        errors.push(`Duplicate wall segment detected at walls[${wallIndex}]`)
      } else {
        wallSegments.add(segmentKey)
      }
    }

    const wallId = (wall as WallLine & { id?: unknown }).id

    if (typeof wallId === "string" && wallId.trim() !== "") {
      if (wallIds.has(wallId)) {
        errors.push(`Duplicate wall id detected: ${wallId}`)
      } else {
        wallIds.add(wallId)
      }
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
