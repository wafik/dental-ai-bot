import { describe, expect, test } from "bun:test";
import { DENTISTS, SERVICES } from "../src/domain/clinic";
import { findAvailableSlots } from "../src/domain/scheduling";

describe("clinic domain", () => {
  test("defines the specified dentists and service durations and eligibility", () => {
    expect(DENTISTS.map(({ id, name, role }) => [id, name, role])).toEqual([
      ["junior", "Junior", "junior"],
      ["senior-1", "Senior 1", "senior"],
      ["senior-2", "Senior 2", "senior"],
    ]);
    expect(
      SERVICES.map(({ code, durationMinutes, eligibleDentistIds }) => [
        code,
        durationMinutes,
        eligibleDentistIds,
      ]),
    ).toEqual([
      ["A", 60, ["junior", "senior-1", "senior-2"]],
      ["B", 60, ["junior", "senior-1", "senior-2"]],
      ["C", 150, ["senior-1", "senior-2"]],
      ["D", 120, ["senior-1", "senior-2"]],
      ["E", 360, ["senior-1", "senior-2"]],
    ]);
  });
});

describe("findAvailableSlots", () => {
  test("assigns each service only to qualified dentists", () => {
    for (const service of SERVICES) {
      const slots = findAvailableSlots({
        service,
        dentists: DENTISTS,
        workingHours: { start: "09:00", end: "17:00" },
        appointments: [],
        date: "2026-10-26",
      });

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((slot) => service.eligibleDentistIds.includes(slot.dentistId))).toBe(true);
    }
  });

  test("finds six consecutive hours for eligible seniors when available", () => {
    const slots = findAvailableSlots({
      service: SERVICES.find((service) => service.code === "E")!,
      dentists: DENTISTS,
      workingHours: { start: "09:00", end: "17:00" },
      appointments: [],
      date: "2026-10-26",
    });

    expect(slots).toContainEqual({
      date: "2026-10-26",
      start: "09:00",
      end: "15:00",
      dentistId: "senior-1",
    });
    expect(slots.some((slot) => slot.end > "17:00")).toBe(false);
    expect(slots.every((slot) => slot.dentistId !== "junior")).toBe(true);
  });

  test("finds a 2.5-hour service on the 30-minute slot grid", () => {
    const slots = findAvailableSlots({
      service: SERVICES.find((service) => service.code === "C")!,
      dentists: DENTISTS,
      workingHours: { start: "09:00", end: "17:00" },
      appointments: [],
      date: "2026-10-26",
    });

    expect(slots).toContainEqual({
      date: "2026-10-26",
      start: "09:00",
      end: "11:30",
      dentistId: "senior-1",
    });
    expect(
      slots.every(
        (slot) =>
          Number(slot.end.slice(0, 2)) * 60 +
            Number(slot.end.slice(3)) -
            (Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3))) ===
          150,
      ),
    ).toBe(true);
  });

  test("does not return slots overlapping an existing same-day appointment", () => {
    const slots = findAvailableSlots({
      service: SERVICES.find((service) => service.code === "A")!,
      dentists: DENTISTS,
      workingHours: { start: "09:00", end: "12:00" },
      appointments: [{ date: "2026-10-26", dentistId: "junior", start: "10:00", end: "11:00" }],
      date: "2026-10-26",
    });

    expect(slots.some((slot) => slot.dentistId === "junior" && slot.start === "09:30")).toBe(false);
    expect(slots.some((slot) => slot.dentistId === "junior" && slot.start === "10:00")).toBe(false);
    expect(slots.some((slot) => slot.dentistId === "junior" && slot.start === "10:30")).toBe(false);
  });

  test("ignores appointments on a different date", () => {
    const slots = findAvailableSlots({
      service: SERVICES.find((service) => service.code === "E")!,
      dentists: DENTISTS,
      workingHours: { start: "09:00", end: "17:00" },
      appointments: [{ date: "2026-10-27", dentistId: "senior-1", start: "09:00", end: "15:00" }],
      date: "2026-10-26",
    });

    expect(slots.some((slot) => slot.dentistId === "senior-1" && slot.start === "09:00")).toBe(
      true,
    );
  });

  test("returns no slot when the service duration exceeds working hours", () => {
    const slots = findAvailableSlots({
      service: SERVICES.find((service) => service.code === "E")!,
      dentists: DENTISTS,
      workingHours: { start: "09:00", end: "14:00" },
      appointments: [],
      date: "2026-10-26",
    });

    expect(slots).toEqual([]);
  });

  test("rejects malformed working-hour and appointment times", () => {
    expect(() =>
      findAvailableSlots({
        service: SERVICES[0]!,
        dentists: DENTISTS,
        workingHours: { start: "9am", end: "17:00" },
        appointments: [],
        date: "2026-10-26",
      }),
    ).toThrow("Time must use 24-hour HH:mm format");

    expect(() =>
      findAvailableSlots({
        service: SERVICES[0]!,
        dentists: DENTISTS,
        workingHours: { start: "09:00", end: "17:00" },
        appointments: [{ date: "2026-10-26", dentistId: "junior", start: "10:00", end: "25:00" }],
        date: "2026-10-26",
      }),
    ).toThrow("Time must use 24-hour HH:mm format");
  });
});
