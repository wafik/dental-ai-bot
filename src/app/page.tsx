"use client";

import React, { useState } from "react";
import { Toaster, toast } from "sonner";
import { ChatWidget } from "@/components/chat-widget";
import { VoiceCallWidget } from "@/components/voice-call-widget";
import { SchedulePreview } from "@/components/schedule-preview";
import { ServicesCatalog } from "@/components/services-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  PhoneCall,
  CalendarDays,
  Stethoscope,
  Sparkles,
  Clock,
  MapPin,
} from "lucide-react";

type ActiveTab = "chat" | "voice" | "schedule" | "services";

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [chatPrompt, setChatPrompt] = useState<string>("");

  const handleServiceSelect = (serviceCode: string) => {
    setActiveTab("chat");
    setChatPrompt(`I would like to book Service ${serviceCode}. Can you check available slots?`);
    toast.info(`Pre-filled chat for Service ${serviceCode}`);
  };

  const handleAppointmentBooked = () => {
    toast.success("Appointment successfully scheduled! Check the Schedule tab for live updates.");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Toaster position="top-right" richColors />

      {/* Top Banner Header */}
      <header className="border-b bg-card shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shadow-sm">
              ✨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">BrightSmile Dental Clinic</h1>
                <Badge variant="success" className="text-[10px] py-0 px-1.5">
                  Live System
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> 09:00 – 17:00 Daily
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Asia/Jakarta (UTC+7)
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="gap-1 px-2.5 py-1">
              <Sparkles className="w-3 h-3 text-primary" />
              <span>AI Receptionist Ready</span>
            </Badge>
            <Button variant="ghost" size="sm" className="text-xs" asChild>
              <a href="/admin">Admin</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto border-b pb-2">
          <Button
            variant={activeTab === "chat" ? "default" : "ghost"}
            size="sm"
            className="gap-2 text-xs"
            onClick={() => setActiveTab("chat")}
          >
            <MessageSquare className="w-4 h-4" />
            <span>AI Text Chat</span>
          </Button>

          <Button
            variant={activeTab === "voice" ? "default" : "ghost"}
            size="sm"
            className="gap-2 text-xs"
            onClick={() => setActiveTab("voice")}
          >
            <PhoneCall className="w-4 h-4" />
            <span>Conversational Voice Call</span>
          </Button>

          <Button
            variant={activeTab === "schedule" ? "default" : "ghost"}
            size="sm"
            className="gap-2 text-xs"
            onClick={() => setActiveTab("schedule")}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Dentist Schedules</span>
          </Button>

          <Button
            variant={activeTab === "services" ? "default" : "ghost"}
            size="sm"
            className="gap-2 text-xs"
            onClick={() => setActiveTab("services")}
          >
            <Stethoscope className="w-4 h-4" />
            <span>Dental Services (5)</span>
          </Button>
        </div>

        {/* Tab Content Display */}
        <div className="flex-1">
          {activeTab === "chat" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ChatWidget
                  initialPrompt={chatPrompt}
                  onAppointmentBooked={handleAppointmentBooked}
                />
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg border bg-card text-xs space-y-3">
                  <h3 className="font-semibold text-sm flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Receptionist Capabilities
                  </h3>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-1.5">
                      <span className="text-primary font-bold">•</span>
                      <span>Real-time availability checking across 3 dentists.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-primary font-bold">•</span>
                      <span>
                        Enforces provider restrictions: Junior dentist cannot perform Root Canal
                        (C), Crown (D), or Implant (E).
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-primary font-bold">•</span>
                      <span>Multi-turn booking and instant cancellation handling.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-primary font-bold">•</span>
                      <span>Automatic calendar collision prevention.</span>
                    </li>
                  </ul>
                </div>

                <SchedulePreview />
              </div>
            </div>
          )}

          {activeTab === "voice" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <VoiceCallWidget />
              </div>

              <div className="p-4 rounded-lg border bg-card text-xs space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <PhoneCall className="w-4 h-4 text-primary" />
                  Voice AI Architecture
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Streams microphone audio to the Gemini Live API over a WebSocket. The server mints
                  a single-use token, so the master API key never reaches the browser.
                </p>
                <div className="border-t pt-2 space-y-1.5 text-muted-foreground">
                  <div className="font-medium text-foreground">Backend Safety Guardrails:</div>
                  <div>• Ephemeral session token prevents API key exposure.</div>
                  <div>• Server-side tool execution enforces dentist qualifications.</div>
                  <div>• In-memory sliding window rate limiting.</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "schedule" && (
            <div className="space-y-4">
              <SchedulePreview />
            </div>
          )}

          {activeTab === "services" && (
            <div className="space-y-4">
              <ServicesCatalog onSelectService={handleServiceSelect} />
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-4 text-center text-xs text-muted-foreground bg-card">
        <div className="max-w-6xl mx-auto px-4">
          BrightSmile Dental Clinic AI Appointment System • Built with Next.js 16 App Router, React
          19, and Bun
        </div>
      </footer>
    </div>
  );
}
