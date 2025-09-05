import { useState, useCallback, useEffect, useRef } from 'react';
import type { ConversationDetail } from '@/components/traces/timeline/types';

interface UseChatActivitiesPollingOptions {
  conversationId: string;
  pollingInterval?: number; // in milliseconds, defaults to 1000
}

interface UseChatActivitiesPollingReturn {
  chatActivities: ConversationDetail | null;
  isPolling: boolean;
  error: string | null;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useChatActivitiesPolling = ({
  conversationId,
  pollingInterval = 1000,
}: UseChatActivitiesPollingOptions): UseChatActivitiesPollingReturn => {
  const [chatActivities, setChatActivities] = useState<ConversationDetail | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastActivityCount, setLastActivityCount] = useState(0);

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isComponentMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchChatActivities = useCallback(async () => {
    try {
      setError(null);

      // Cancel any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      const currentConversationId = conversationId; // Capture current ID

      const response = await fetch(`/api/signoz/conversations/${currentConversationId}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        // If conversation doesn't exist yet, that's fine - just return
        if (response.status === 404) return;
        throw new Error('Failed to fetch chat activities');
      }

      const data: ConversationDetail = await response.json();

      // Validate that the response is still for the current conversation
      if (isComponentMountedRef.current && currentConversationId === conversationId) {
        // Only update state if data actually changed (by checking activity count)
        const newCount = data.activities?.length || 0;
        if (newCount !== lastActivityCount) {
          setChatActivities(data);
          setLastActivityCount(newCount);
        }
      }
    } catch (err) {
      // Don't log abort errors as they are expected when cancelling requests
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      if (isComponentMountedRef.current) {
        console.warn('Error fetching chat activities:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    }
  }, [conversationId, lastActivityCount]);

  // Start polling
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return; // Already polling

    setIsPolling(true);

    // Initial fetch
    fetchChatActivities();

    // Set up polling interval
    pollingIntervalRef.current = setInterval(() => {
      fetchChatActivities();
    }, pollingInterval);
  }, [fetchChatActivities, pollingInterval]);

  // Stop polling
  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isComponentMountedRef.current = true;
    return () => {
      isComponentMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  // Reset chat activities and stop polling when conversationId changes
  const prevConversationIdRef = useRef(conversationId);
  useEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      setChatActivities(null);
      setLastActivityCount(0);
      setError(null);

      // Stop polling for old conversation
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsPolling(false);

      prevConversationIdRef.current = conversationId;
    }
  });

  return {
    chatActivities,
    isPolling,
    error,
    startPolling,
    stopPolling,
  };
};
