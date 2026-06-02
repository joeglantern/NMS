import { FastifyInstance } from 'fastify';

export class AnalyticsService {
  constructor(private app: FastifyInstance) {}

  async getAnalytics(filters: { from: Date; to: Date }) {
    const { from, to } = filters;
    const where = { createdAt: { gte: from, lte: to } };

    const [
      total,
      byGender,
      bySubCounty,
      byReferral,
      byStatus,
      tasks,
      trendRaw,
    ] = await Promise.all([
      this.app.prisma.incident.count({ where }),

      this.app.prisma.incident.groupBy({
        by: ['patientGender'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      this.app.prisma.incident.groupBy({
        by: ['subCounty'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 8,
      }),

      this.app.prisma.$queryRaw<Array<{ facility: string; count: bigint }>>`
        SELECT place_of_referral AS facility, COUNT(*) AS count
        FROM incidents
        WHERE created_at >= ${from} AND created_at <= ${to}
          AND place_of_referral IS NOT NULL AND place_of_referral <> ''
        GROUP BY place_of_referral
        ORDER BY count DESC
        LIMIT 8
      `,

      this.app.prisma.incident.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),

      this.app.prisma.task.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          receivedAt: true,
          acceptedAt: true,
          sceneArrivalAt: true,
          facilityArrivalAt: true,
          completedAt: true,
          status: true,
        },
      }),

      this.app.prisma.incident.findMany({
        where,
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // TAT averages in minutes
    const avg = (arr: number[]) =>
      arr.length > 0
        ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
        : null;

    const dispatchTimes = tasks
      .filter(t => t.acceptedAt)
      .map(t => (t.acceptedAt!.getTime() - t.receivedAt.getTime()) / 60000);

    const sceneTimes = tasks
      .filter(t => t.acceptedAt && t.sceneArrivalAt)
      .map(t => (t.sceneArrivalAt!.getTime() - t.acceptedAt!.getTime()) / 60000);

    const hospitalTimes = tasks
      .filter(t => t.sceneArrivalAt && t.facilityArrivalAt)
      .map(t => (t.facilityArrivalAt!.getTime() - t.sceneArrivalAt!.getTime()) / 60000);

    // Daily incident trend
    const trendMap: Record<string, number> = {};
    for (const inc of trendRaw) {
      const day = inc.createdAt.toISOString().split('T')[0];
      trendMap[day] = (trendMap[day] ?? 0) + 1;
    }
    const trend = Object.entries(trendMap).map(([date, count]) => ({ date, count }));

    return {
      total,
      byGender: byGender.map(g => ({
        gender: g.patientGender || 'Unknown',
        count: g._count.id,
      })),
      bySubCounty: bySubCounty.map(s => ({
        subCounty: s.subCounty,
        count: s._count.id,
      })),
      byReferral: (byReferral as Array<{ facility: string; count: bigint }>).map(r => ({
        facility: r.facility,
        count: Number(r.count),
      })),
      byStatus: byStatus.map(s => ({
        status: s.status as string,
        count: s._count.id,
      })),
      tat: {
        avgDispatchMinutes: avg(dispatchTimes),
        avgSceneMinutes: avg(sceneTimes),
        avgHospitalMinutes: avg(hospitalTimes),
      },
      trend,
    };
  }
}
