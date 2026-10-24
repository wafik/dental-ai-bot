export type DentistRole = "junior" | "senior";

export type Dentist = {
  id: string;
  name: string;
  role: DentistRole;
};

export type DentalService = {
  code: "A" | "B" | "C" | "D" | "E";
  name: string;
  durationMinutes: number;
  eligibleDentistIds: string[];
};

export const DENTISTS: Dentist[] = [
  { id: "junior", name: "Junior", role: "junior" },
  { id: "senior-1", name: "Senior 1", role: "senior" },
  { id: "senior-2", name: "Senior 2", role: "senior" },
];

export const SERVICES: DentalService[] = [
  {
    code: "A",
    name: "General Checkup & Cleaning",
    durationMinutes: 60,
    eligibleDentistIds: ["junior", "senior-1", "senior-2"],
  },
  {
    code: "B",
    name: "Simple Tooth Extraction",
    durationMinutes: 60,
    eligibleDentistIds: ["junior", "senior-1", "senior-2"],
  },
  {
    code: "C",
    name: "Root Canal Treatment",
    durationMinutes: 150,
    eligibleDentistIds: ["senior-1", "senior-2"],
  },
  {
    code: "D",
    name: "Dental Crown / Veneer",
    durationMinutes: 120,
    eligibleDentistIds: ["senior-1", "senior-2"],
  },
  {
    code: "E",
    name: "Full Mouth Implant Surgery",
    durationMinutes: 360,
    eligibleDentistIds: ["senior-1", "senior-2"],
  },
];
