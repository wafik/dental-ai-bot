"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, User, Sparkles, Loader2 } from "lucide-react";
import type { LLMChatMessage } from "@/providers/ai/llm-provider";

export type ChatWidgetProps = {
  initialPrompt?: string;
  onAppointmentBooked?: () => void;
};

const SUGGESTIONS = [
  "What services do you offer?",
  "Check availability for Service A on 2026-10-28",
  "Can I book a Root Canal with Dr. Junior?",
  "Book a general cleaning tomorrow at 10:00",
];

export function ChatWidget({ initialPrompt, onAppointmentBooked }: ChatWidgetProps) {
  const [messages, setMessages] = useState<LLMChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello! Welcome to BrightSmile Dental Clinic. I am your virtual appointment receptionist. How may I assist you with scheduling or learning about our dental services today?",
    },
  ]);
  const [input, setInput] = useState(initialPrompt || "");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
    }
  }, [initialPrompt]);

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || loading) return;

    const userMessage: LLMChatMessage = { role: "user", content: textToSend.trim() };
    const updatedMessages: LLMChatMessage[] = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.success && data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);

        if (
          data.reply.toLowerCase().includes("confirmed") ||
          data.reply.toLowerCase().includes("booked")
        ) {
          onAppointmentBooked?.();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get reply";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Sorry, an error occurred: ${msg}. Please try again shortly.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-[600px] w-full">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                Dental Clinic AI Assistant
                <Badge variant="success" className="text-[10px] py-0 px-1">
                  Active
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Inquire about services, check slots, or schedule appointments
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, index) => {
          const isUser = m.role === "user";
          return (
            <div
              key={index}
              className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                  isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div
                className={`rounded-lg px-3 py-2 text-xs max-w-[80%] whitespace-pre-wrap leading-relaxed shadow-xs ${
                  isUser
                    ? "bg-primary text-primary-foreground font-normal"
                    : "bg-muted/50 border text-foreground"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Assistant is thinking...</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-2.5 border-t p-3 bg-card">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {SUGGESTIONS.map((s, idx) => (
            <button
              key={idx}
              type="button"
              className="text-[11px] bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full px-2.5 py-1 whitespace-nowrap transition-colors border"
              onClick={() => handleSend(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex w-full items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question or booking request..."
            className="text-xs h-9"
            disabled={loading}
          />
          <Button
            type="submit"
            size="sm"
            className="h-9 px-3 gap-1"
            disabled={loading || !input.trim()}
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-xs">Send</span>
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
