import { prisma } from "@/lib/prisma";

const players = [
  ["Jack", "Thompson", "GK"],
  ["Noah", "Williams", "DEF"],
  ["Oliver", "Smith", "MID"],
  ["Harry", "Brown", "MID"],
  ["Charlie", "Jones", "FWD"],
  ["Leo", "Wilson", "DEF"],
  ["George", "Taylor", "MID"],
  ["Alfie", "Davies", "FWD"],
  ["Theo", "Evans", "DEF"],
  ["Oscar", "Thomas", "MID"],
  ["Archie", "Roberts", "FWD"],
  ["Freddie", "Johnson", "MID"],
  ["Henry", "Lewis", "DEF"],
  ["Arthur", "Walker", "FWD"],
  ["Finley", "Robinson", "MID"],
  ["Teddy", "Wright", "DEF"],
] as const;

export async function ensureCoachHubData() {
  let team = await prisma.team.findFirst({ include: { players: true } });
  if (team) return team;

  team = await prisma.team.create({
    data: {
      name: "Caversham Falcons U10s",
      ageGroup: "U10",
      club: "Caversham A.F.C Falcons",
      players: {
        create: players.map(([firstName, lastName, position]) => ({ firstName, lastName, position })),
      },
    },
    include: { players: true },
  });

  const now = new Date();
  const nextTraining = new Date(now);
  nextTraining.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7 || 7));
  nextTraining.setHours(18, 0, 0, 0);
  const nextMatch = new Date(nextTraining);
  nextMatch.setDate(nextTraining.getDate() + 1);
  nextMatch.setHours(10, 30, 0, 0);

  const training = await prisma.event.create({
    data: {
      teamId: team.id,
      type: "TRAINING",
      title: "Finishing & movement",
      startsAt: nextTraining,
      endsAt: new Date(nextTraining.getTime() + 60 * 60 * 1000),
      venue: "Mapledurham",
    },
  });

  const match = await prisma.event.create({
    data: {
      teamId: team.id,
      type: "MATCH",
      title: "Caversham Falcons U10s",
      opponent: "Reading United",
      startsAt: nextMatch,
      venue: "Mapledurham",
      arrivalTime: new Date(nextMatch.getTime() - 45 * 60 * 1000),
    },
  });

  await prisma.availability.createMany({
    data: team.players.flatMap((player, index) => [
      { eventId: training.id, playerId: player.id, status: index === 2 || index === 5 ? "PENDING" : "AVAILABLE" },
      { eventId: match.id, playerId: player.id, status: index === 2 || index === 5 ? "PENDING" : index === 7 ? "UNAVAILABLE" : "AVAILABLE" },
    ]),
  });

  const focus = [
    [team.players.find((p) => p.firstName === "Oliver")!, "Scanning before receiving", "Look over both shoulders before the ball arrives and play forward when possible."],
    [team.players.find((p) => p.firstName === "Leo")!, "Defensive positioning", "Stay connected to the centre-back and protect the space inside."],
  ];
  await prisma.feedback.createMany({
    data: focus.map(([player, needsWork]) => ({
      playerId: (player as typeof team.players[number]).id,
      coachName: "Coach",
      needsWork: needsWork as string,
      wentWell: "Good energy and attitude in the session.",
      focusNext: "Apply the focus consistently in small-sided games.",
    })),
  });

  return team;
}
