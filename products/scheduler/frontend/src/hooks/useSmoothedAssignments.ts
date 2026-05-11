/**
 * Hook for smoothing assignment animations during schedule generation.
 * Buffers incoming assignments and releases them at a consistent rate
 * for smoother, more linear animation regardless of backend timing.
 */
import { useEffect, useState, useRef } from 'react';
import type { ScheduleAssignment } from '../api/dto';

interface UseSmoothedAssignmentsOptions {
  /** Milliseconds between each assignment appearing (default: 40ms) */
  releaseInterval?: number;
  /** Whether smoothing is enabled (disable for instant display) */
  enabled?: boolean;
}

export function useSmoothedAssignments(
  rawAssignments: ScheduleAssignment[],
  isGenerating: boolean,
  options: UseSmoothedAssignmentsOptions = {}
): ScheduleAssignment[] {
  const { releaseInterval = 40, enabled = true } = options;

  // The smoothed output assignments
  const [smoothedAssignments, setSmoothedAssignments] = useState<ScheduleAssignment[]>([]);

  // Queue of assignments waiting to be released
  const queueRef = useRef<ScheduleAssignment[]>([]);

  // Set of assignment match IDs already displayed
  const displayedIdsRef = useRef<Set<string>>(new Set());

  // Interval timer ref
  const intervalRef = useRef<number | null>(null);

  // Track previous generating state to detect start
  const wasGeneratingRef = useRef(false);

  // Clear state when generation starts
  useEffect(() => {
    if (isGenerating && !wasGeneratingRef.current) {
      // Generation just started - clear everything
      queueRef.current = [];
      displayedIdsRef.current.clear();
      setSmoothedAssignments([]);
    }
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Process incoming raw assignments into the queue
  useEffect(() => {
    if (!enabled) {
      // Smoothing disabled - show all immediately
      setSmoothedAssignments(rawAssignments);
      return;
    }

    // Find new assignments that haven't been queued or displayed
    const newAssignments = rawAssignments.filter(
      a => !displayedIdsRef.current.has(a.matchId) &&
           !queueRef.current.some(q => q.matchId === a.matchId)
    );

    if (newAssignments.length > 0) {
      // Add new assignments to the queue
      queueRef.current.push(...newAssignments);
    }
  }, [rawAssignments, enabled]);

  // Release assignments from queue at steady rate
  useEffect(() => {
    if (!enabled) return;

    // Release function
    const releaseNext = () => {
      if (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        displayedIdsRef.current.add(next.matchId);
        setSmoothedAssignments(prev => [...prev, next]);
      }
    };

    // Start interval when generating
    if (isGenerating || queueRef.current.length > 0) {
      intervalRef.current = window.setInterval(releaseNext, releaseInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isGenerating, releaseInterval, enabled]);

  // When generation completes, flush remaining queue quickly
  useEffect(() => {
    if (!isGenerating && enabled && queueRef.current.length > 0) {
      // Flush remaining at faster rate
      const flushInterval = window.setInterval(() => {
        if (queueRef.current.length > 0) {
          const next = queueRef.current.shift()!;
          displayedIdsRef.current.add(next.matchId);
          setSmoothedAssignments(prev => [...prev, next]);
        } else {
          clearInterval(flushInterval);
        }
      }, 15); // Faster flush when complete

      return () => clearInterval(flushInterval);
    }
  }, [isGenerating, enabled]);

  // If not generating and queue is empty, sync with raw (handles reloads)
  useEffect(() => {
    if (!isGenerating && queueRef.current.length === 0 && rawAssignments.length > 0) {
      // Check if we're out of sync
      if (smoothedAssignments.length !== rawAssignments.length) {
        // Sync directly
        const smoothedIds = new Set(smoothedAssignments.map(a => a.matchId));
        const missing = rawAssignments.filter(a => !smoothedIds.has(a.matchId));

        if (missing.length > 0) {
          missing.forEach(a => displayedIdsRef.current.add(a.matchId));
          setSmoothedAssignments(rawAssignments);
        }
      }
    }
  }, [isGenerating, rawAssignments, smoothedAssignments]);

  return enabled ? smoothedAssignments : rawAssignments;
}
