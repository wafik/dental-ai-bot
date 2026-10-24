import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SERVICES } from "@/domain/clinic";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-12 px-6 py-16 sm:px-10">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Dental clinic assistant</p>
        <h1 className="text-4xl font-semibold tracking-tight">Appointments made simple.</h1>
        <p className="max-w-2xl text-muted-foreground">
          Chat or talk with the assistant to find an appointment that fits your service and dentist.
        </p>
      </header>
      <section aria-labelledby="services-heading" className="flex flex-col gap-4">
        <h2 id="services-heading" className="text-xl font-semibold">
          Available services
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <li key={service.code}>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle>{service.name}</CardTitle>
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                      {service.durationMinutes / 60}h
                    </span>
                  </div>
                  <CardDescription>
                    Dentists:{" "}
                    {service.eligibleDentistIds
                      .map((id) =>
                        id === "junior" ? "Junior" : id === "senior-1" ? "Senior 1" : "Senior 2",
                      )
                      .join(", ")}
                  </CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="booking-heading">
        <Card>
          <CardHeader>
            <CardTitle id="booking-heading">Appointment chat</CardTitle>
            <CardDescription>
              Chat and voice booking will be available here. For now, the clinic’s service and
              dentist rules are ready.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  );
}
