"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRealtimeVoice } from "@/features/voice/use-realtime-voice";
import { Phone, PhoneOff, Mic, MicOff, Volume2, AlertCircle, Sparkles } from "lucide-react";

export function VoiceCallWidget() {
  const { state, isMuted, error, transcripts, connect, disconnect, toggleMute } =
    useRealtimeVoice();

  const isConnected = state === "connected" || state === "listening" || state === "speaking";
  const isConnecting = state === "connecting";

  const getStatusBadge = () => {
    switch (state) {
      case "idle":
        return <Badge variant="outline">Ready</Badge>;
      case "connecting":
        return (
          <Badge variant="warning" className="animate-pulse">
            Connecting...
          </Badge>
        );
      case "listening":
        return (
          <Badge variant="success" className="animate-pulse">
            Patient Speaking...
          </Badge>
        );
      case "speaking":
        return (
          <Badge variant="default" className="animate-pulse">
            Assistant Speaking...
          </Badge>
        );
      case "connected":
        return <Badge variant="success">Connected</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">{state}</Badge>;
    }
  };

  return (
    <Card className="flex flex-col h-[600px] w-full">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                Real-Time Voice Assistant
                {getStatusBadge()}
              </CardTitle>
              <CardDescription className="text-xs">
                Two-way natural voice call with the appointment assistant
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-between p-6">
        {/* Visual Pulse / Indicator Area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 my-auto">
          <div className="relative flex items-center justify-center">
            {isConnected && (
              <div
                className={`absolute w-32 h-32 rounded-full opacity-30 animate-ping ${
                  state === "speaking"
                    ? "bg-primary"
                    : state === "listening"
                      ? "bg-emerald-500"
                      : "bg-muted"
                }`}
              />
            )}
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-md ${
                state === "speaking"
                  ? "bg-primary text-primary-foreground scale-110"
                  : state === "listening"
                    ? "bg-emerald-600 text-white scale-105"
                    : isConnected
                      ? "bg-muted text-foreground"
                      : "bg-muted/50 text-muted-foreground"
              }`}
            >
              {isConnected ? (
                <Mic className="w-10 h-10 animate-bounce" />
              ) : (
                <Phone className="w-10 h-10" />
              )}
            </div>
          </div>

          <div className="text-center space-y-1">
            <h3 className="text-sm font-semibold">
              {!isConnected
                ? "Click 'Start Voice Call' to speak with receptionist"
                : state === "speaking"
                  ? "AI Assistant is answering..."
                  : state === "listening"
                    ? "Listening to you..."
                    : "Microphone active. Speak naturally."}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Supports real-time booking, qualification checking, and clinic inquiries with zero
              audio delay.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20 max-w-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Live Transcripts Waterfall */}
        {transcripts.length > 0 && (
          <div className="border rounded-md p-3 bg-muted/20 max-h-36 overflow-y-auto space-y-1.5 text-xs mb-4">
            <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
              <Sparkles className="w-3 h-3" /> Live Speech Transcript
            </div>
            {transcripts.slice(-4).map((t) => (
              <div key={t.id} className="text-xs leading-relaxed">
                <span className={t.isUser ? "font-semibold text-primary" : "text-foreground"}>
                  {t.text}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Controls Bar */}
        <div className="flex items-center justify-center gap-4 pt-4 border-t">
          {!isConnected ? (
            <Button size="lg" className="gap-2 px-6" onClick={connect} disabled={isConnecting}>
              <Phone className="w-4 h-4" />
              <span>{isConnecting ? "Connecting WebRTC..." : "Start Voice Call"}</span>
            </Button>
          ) : (
            <>
              <Button
                variant={isMuted ? "destructive" : "outline"}
                size="icon"
                onClick={toggleMute}
                title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>

              <Button variant="destructive" className="gap-2 px-6" onClick={disconnect}>
                <PhoneOff className="w-4 h-4" />
                <span>End Call</span>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
