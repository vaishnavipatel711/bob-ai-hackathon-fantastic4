// useSensorStream.js — annotates live asset data with change-detection metadata.
// Tracks previous risk scores, computes deltas, and assigns flash CSS classes
// for animated indicators when risk escalates.

import { useState, useEffect, useRef } from 'react';

const FLASH_DURATION_MS = 2000;
const ESCALATION_THRESHOLD = 0.05; // 5 risk-score points

export default function useSensorStream(assets) {
  const previousRef = useRef({}); // assetId -> previous risk_score
  const flashTimers = useRef({});  // assetId -> clearTimeout handle

  // FIX: initialize with assets directly so first render is never empty
  const [annotated, setAnnotated] = useState(() =>
    assets ? assets.map((a) => ({ ...a, previous_risk_score: a.risk_score, risk_delta: 0, is_escalating: false, flash_class: '' })) : []
  );

  useEffect(() => {
    if (!assets || assets.length === 0) return;

    setAnnotated((prev) => {
      // Build a lookup of current flash states so we can preserve active flashes
      const currentFlashMap = {};
      prev.forEach((a) => {
        if (a.flash_class) currentFlashMap[a.asset_id] = a.flash_class;
      });

      const next = assets.map((asset) => {
        const id = asset.asset_id;
        const prevScore = previousRef.current[id] ?? asset.risk_score;
        const delta = asset.risk_score - prevScore;
        const isEscalating = delta > ESCALATION_THRESHOLD;

        let flashClass = currentFlashMap[id] || '';

        if (isEscalating) {
          // Determine flash class from current risk level
          if (asset.risk_score > 0.75) {
            flashClass = 'flash-critical';
          } else if (asset.risk_score > 0.5) {
            flashClass = 'flash-high';
          } else {
            flashClass = 'flash-medium';
          }

          // Clear any existing timer for this asset
          if (flashTimers.current[id]) {
            clearTimeout(flashTimers.current[id]);
          }

          // Schedule flash class removal after FLASH_DURATION_MS
          flashTimers.current[id] = setTimeout(() => {
            setAnnotated((cur) =>
              cur.map((a) => (a.asset_id === id ? { ...a, flash_class: '' } : a))
            );
            delete flashTimers.current[id];
          }, FLASH_DURATION_MS);
        }

        // Update previous score reference
        previousRef.current[id] = asset.risk_score;

        return {
          ...asset,
          previous_risk_score: prevScore,
          risk_delta: delta,
          is_escalating: isEscalating,
          flash_class: flashClass,
        };
      });

      return next;
    });
  }, [assets]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(flashTimers.current).forEach(clearTimeout);
    };
  }, []);

  return annotated;
}
