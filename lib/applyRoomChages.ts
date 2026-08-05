import { FloorPlan, Floor, Room } from "./floorplanRenderer";

export interface RoomChange {
  roomId: string;
  action:
    | "ConvertToBedroom"
    | "ConvertToKitchen"
    | "ConvertToBathroom"
    | "ConvertToEnsuite"
    | "SplitRoom"
    | "MergeRoom"
    | "ExtendBathroom"
    | "NoChange";

  newName?: string;
  newType?: string;

  split?: {
    firstName: string;
    firstType: string;
    secondName: string;
    secondType: string;
    direction?: "horizontal" | "vertical";
  };
}

export function applyRoomChanges(
  original: FloorPlan,
  changes: RoomChange[]
): FloorPlan {

  const proposed: FloorPlan = JSON.parse(
    JSON.stringify(original)
  );

  for (const floor of proposed.floors) {

    const newRooms: Room[] = [];

    for (const room of floor.rooms) {

      const change = changes.find(
        c => c.roomId === room.id
      );

      if (!change) {
        newRooms.push(room);
        continue;
      }

      switch (change.action) {

        case "ConvertToBedroom":

          room.name =
            change.newName ??
            room.name;

          room.type =
            change.newType ??
            "Bedroom";

          newRooms.push(room);

          break;

        case "ConvertToKitchen":

          room.name =
            change.newName ??
            "Kitchen";

          room.type = "Kitchen";

          newRooms.push(room);

          break;

        case "ConvertToBathroom":

          room.name =
            change.newName ??
            "Bathroom";

          room.type = "Bathroom";

          newRooms.push(room);

          break;

        case "ConvertToEnsuite":

          room.name =
            change.newName ??
            "Ensuite";

          room.type = "Ensuite";

          newRooms.push(room);

          break;

        case "ExtendBathroom":

          room.width += 30;
          room.height += 30;

          newRooms.push(room);

          break;

        case "SplitRoom":

          if (!change.split) {
            newRooms.push(room);
            break;
          }

          if (
            change.split.direction === "horizontal"
          ) {

            const half =
              room.height / 2;

            newRooms.push({

              ...room,

              id: room.id + "-1",

              name: change.split.firstName,

              type: change.split.firstType,

              height: half

            });

            newRooms.push({

              ...room,

              id: room.id + "-2",

              name: change.split.secondName,

              type: change.split.secondType,

              y: room.y + half,

              height: half

            });

          } else {

            const half =
              room.width / 2;

            newRooms.push({

              ...room,

              id: room.id + "-1",

              name: change.split.firstName,

              type: change.split.firstType,

              width: half

            });

            newRooms.push({

              ...room,

              id: room.id + "-2",

              name: change.split.secondName,

              type: change.split.secondType,

              x: room.x + half,

              width: half

            });

          }

          break;

        case "MergeRoom":

          newRooms.push(room);

          break;

        default:

          newRooms.push(room);

      }

    }

    floor.rooms = newRooms;

  }

  return proposed;

}
