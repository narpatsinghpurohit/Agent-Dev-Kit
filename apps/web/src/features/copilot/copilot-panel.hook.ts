import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { useCallback, useRef, useState } from 'react';
import { authFetch, speechTranscribe, speechTts } from '@repo/api-client';
import { useInvalidateTasks } from '../tasks/tasks-cache.hook';

/**
 * Copilot ViewModel: wraps the AI SDK's useChat with this app's transport
 * (authFetch adds the Bearer token and the 401→refresh→retry), approval
 * responses for mutating tools, push-to-talk transcription, and TTS.
 */
export function useCopilotPanel() {
  const invalidateTasks = useInvalidateTasks();
  const [conversationId] = useState(() => `chat_${crypto.randomUUID()}`);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const chat = useChat({
    id: conversationId,
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      fetch: authFetch as typeof fetch,
    }),
    // Approve/deny answers round-trip to the server automatically.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => {
      // The copilot mutates tasks through its tools — refresh what's on screen.
      void invalidateTasks();
    },
  });

  const onSubmit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    void chat.sendMessage({ text });
  }, [chat, input]);

  const onApproval = useCallback(
    (approvalId: string, approved: boolean) => {
      void chat.addToolApprovalResponse({ id: approvalId, approved });
    },
    [chat],
  );

  const onToggleRecording = useCallback(async () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/mp4';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      recorderRef.current = null;
      setIsRecording(false);
      for (const track of stream.getTracks()) track.stop();
      const audio = new Blob(chunks, { type: mimeType });
      setIsTranscribing(true);
      speechTranscribe({ audio })
        .then((result) => {
          setInput((current) => `${current}${current ? ' ' : ''}${result.text}`.trim());
        })
        .catch(() => undefined)
        .finally(() => setIsTranscribing(false));
    };
    recorderRef.current = recorder;
    setIsRecording(true);
    recorder.start();
  }, []);

  const onSpeak = useCallback((text: string) => {
    void speechTts({ text })
      .then((wav) => {
        // The TTS endpoint streams audio/wav; openapi types it as void.
        const url = URL.createObjectURL(wav as unknown as Blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        return audio.play();
      })
      .catch(() => undefined);
  }, []);

  return {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    input,
    isRecording,
    isTranscribing,
    micAvailable: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices),
    onInputChange: setInput,
    onSubmit,
    onApproval,
    onToggleRecording,
    onSpeak,
    onStop: chat.stop,
  };
}

export type CopilotPanelViewModel = ReturnType<typeof useCopilotPanel>;
