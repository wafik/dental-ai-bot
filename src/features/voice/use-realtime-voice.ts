"use client";

import { useEffect, useRef, useState } from "react";
import { DefaultVoiceTransport } from "./default-transport";
import {
  VoiceSessionManager,
  type VoiceSessionManagerOptions,
  type VoiceSessionState,
} from "./voice-session-manager";

export type TranscriptItem = {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: number;
};

export function useRealtimeVoice(options?: VoiceSessionManagerOptions) {
  const [state, setState] = useState<VoiceSessionState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const managerRef = useRef<VoiceSessionManager | null>(null);

  const transport = options?.transport;
  const executeTool = options?.executeTool;

  useEffect(() => {
    const manager = new VoiceSessionManager({
      transport: transport ?? new DefaultVoiceTransport(),
      executeTool,
    });
    managerRef.current = manager;

    const unsubState = manager.onStateChange((newState) => {
      setState(newState);
      if (newState === "disconnected" || newState === "idle") {
        setIsMuted(false);
      }
    });

    const unsubError = manager.onError((err) => {
      setError(err.message);
    });

    const unsubTranscript = manager.onTranscript((text, isUser) => {
      setTranscripts((prev) => [
        ...prev,
        {
          id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          text,
          isUser,
          timestamp: Date.now(),
        },
      ]);
    });

    return () => {
      unsubState();
      unsubError();
      unsubTranscript();
      manager.disconnect();
    };
  }, [transport, executeTool]);

  const connect = async () => {
    setError(null);
    try {
      await managerRef.current?.connect();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  const disconnect = () => {
    managerRef.current?.disconnect();
  };

  const toggleMute = () => {
    if (managerRef.current) {
      const nowMuted = managerRef.current.toggleMute();
      setIsMuted(nowMuted);
    }
  };

  return {
    state,
    isMuted,
    error,
    transcripts,
    connect,
    disconnect,
    toggleMute,
  };
}
