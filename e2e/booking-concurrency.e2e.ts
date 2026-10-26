import { expect, test } from "@playwright/test";

test.describe("Booking concurrency", () => {
  test("reserves an overlapping slot exactly once", async ({ request }) => {
    const payload = {
      patientName: "Race Test",
      patientPhone: "+628123456789",
      serviceCode: "A",
      dentistId: "junior",
      date: "2026-11-10",
      startTime: "09:00",
    };

    const [first, second] = await Promise.all([
      request.post("/api/v1/appointments", { data: payload }),
      request.post("/api/v1/appointments", { data: payload }),
    ]);

    const statuses = [first.status(), second.status()].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 422]);

    const list = await request.get("/api/v1/appointments?date=2026-11-10");
    expect(list.ok()).toBe(true);
    const listed = await list.json();
    expect(listed.appointments).toHaveLength(1);
    expect(listed.appointments[0].startTime).toBe("09:00");

    const later = await request.post("/api/v1/appointments", {
      data: { ...payload, startTime: "10:00" },
    });
    expect(later.status()).toBe(201);
  });
});
