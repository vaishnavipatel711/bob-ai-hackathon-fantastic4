import React, { useState } from 'react';
import { askBob } from '../api';

const RISK_COLOR = {
  critical: 'var(--risk-high)',
  high: 'var(--risk-high)',
  medium: 'var(--risk-medium)',
  low: 'var(--risk-low)',
};

function assetNameFor(assets, assetId) {
  const asset = assets.find((a) => a.asset_id === assetId);

  if (!asset) return assetId;

  return (
    asset.location?.name ??
    asset.asset_name ??
    assetId
  );
}

function riskLevelFor(assets, assetId) {
  const asset = assets.find((a) => a.asset_id === assetId);

  return asset
    ? asset.risk_level ?? null
    : null;
}

function formatEta(hours) {
  if (hours == null) return 'Not specified';

  if (hours < 24) {
    return `${hours} hours`;
  }

  const days = Math.round(hours / 24);

  return `${days} day${days === 1 ? '' : 's'}`;
}

export default function DispatchPlan({ plan = [], assets = [] }) {
  const [question, setQuestion] = useState('');
  const [thread, setThread] = useState([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState(false);

  async function handleAsk(e) {
    e.preventDefault();

    const trimmed = question.trim();

    if (!trimmed || asking) return;

    setAsking(true);
    setAskError(false);
    setQuestion('');

    try {
      const { answer } = await askBob(trimmed);

      setThread((prev) => [
        ...prev,
        {
          question: trimmed,
          answer,
        },
      ]);
    } catch (err) {
      setAskError(true);

      setThread((prev) => [
        ...prev,
        {
          question: trimmed,
          answer: null,
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="dispatch">

      {/* -------------------------------------------------- */}
      {/* Dispatch plan header */}
      {/* -------------------------------------------------- */}

      <div className="dispatch__header">
        <div>
          <div className="dispatch__title">
            Prioritised Dispatch Plan
          </div>

          <div className="dispatch__subtitle">
            Recommended maintenance actions and crew response windows
          </div>
        </div>

        <div className="dispatch__count">
          {plan.length} asset{plan.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Empty state */}
      {/* -------------------------------------------------- */}

      {plan.length === 0 ? (
        <div className="dispatch__empty">
          No dispatch actions are currently required.
        </div>
      ) : (
        <ol
          className="dispatch__list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
          }}
        >
          {plan.map((step, idx) => {
            const level = riskLevelFor(
              assets,
              step.asset_id
            );

            const color =
              RISK_COLOR[level] || 'var(--hairline)';

            const planStep = step.plan_step || {};

            const priorityRank =
              planStep.priority_rank ?? idx + 1;

            const action =
              planStep.action ||
              'No action specified';

            const crewType =
              planStep.crew_type ||
              'Not specified';

            const dispatchLocation =
              planStep.dispatch_location ||
              assetNameFor(assets, step.asset_id);

            const etaHours =
              planStep.eta_hours ?? null;

            const prePosition =
              planStep.pre_position === true;

            const reason =
              planStep.reason ||
              step.explanation ||
              'No reason provided.';

            return (
              <li
                key={`${step.asset_id}-${idx}`}
                className={`dispatch__step${
                  idx % 2 === 1
                    ? ' dispatch__step--alt'
                    : ''
                }`}
                style={{
                  borderLeft: `3px solid ${color}`,
                }}
              >

                {/* Priority rank */}
                <span
                  className="dispatch__rank"
                  style={{
                    borderColor: color,
                    color,
                  }}
                >
                  {priorityRank}
                </span>

                {/* Main dispatch information */}
                <div className="dispatch__step-content">

                  <div className="dispatch__step-asset">
                    {assetNameFor(assets, step.asset_id)}
                    {' · '}
                    {step.asset_id}
                  </div>

                  <div className="dispatch__step-action">
                    {action}
                  </div>

                  {/* Operational details */}
                  <div className="dispatch__step-details">

                    <div className="dispatch__detail">
                      <span className="dispatch__detail-label">
                        Crew
                      </span>

                      <span className="dispatch__detail-value">
                        {crewType}
                      </span>
                    </div>

                    <div className="dispatch__detail">
                      <span className="dispatch__detail-label">
                        Dispatch
                      </span>

                      <span className="dispatch__detail-value">
                        {dispatchLocation}
                      </span>
                    </div>

                    <div className="dispatch__detail">
                      <span className="dispatch__detail-label">
                        Response
                      </span>

                      <span className="dispatch__detail-value">
                        {formatEta(etaHours)}
                      </span>
                    </div>

                    <div className="dispatch__detail">
                      <span className="dispatch__detail-label">
                        Pre-position
                      </span>

                      <span
                        className="dispatch__detail-value"
                        style={{
                          color: prePosition
                            ? 'var(--risk-high)'
                            : 'inherit',
                          fontWeight: prePosition
                            ? 600
                            : 400,
                        }}
                      >
                        {prePosition ? 'Yes' : 'No'}
                      </span>
                    </div>

                  </div>

                  {/* Reason */}
                  <div className="dispatch__step-reason">
                    <strong>Why:</strong> {reason}
                  </div>

                </div>

                {/* ETA badge */}
                <span className="dispatch__eta">
                  {etaHours != null
                    ? `ETA ${etaHours}h`
                    : '—'}
                </span>

              </li>
            );
          })}
        </ol>
      )}

      {/* -------------------------------------------------- */}
      {/* Ask Bob section */}
      {/* -------------------------------------------------- */}

      <div className="dispatch__ask">

        <div className="dispatch__ask-label">
          Ask Bob about the grid
        </div>

        {thread.length > 0 && (
          <div className="dispatch__thread">
            {thread.map((qa, i) => (
              <React.Fragment key={i}>

                <div className="dispatch__qa-q">
                  {qa.question}
                </div>

                {qa.answer ? (
                  <div className="dispatch__qa-a">
                    {qa.answer}
                  </div>
                ) : (
                  <div
                    className="dispatch__qa-a"
                    style={{
                      borderLeftColor: 'var(--risk-high)',
                      color: 'var(--risk-high)',
                    }}
                  >
                    Couldn't reach Bob for that one — try again.
                  </div>
                )}

              </React.Fragment>
            ))}
          </div>
        )}

        {asking && (
          <div className="dispatch__qa-loading">
            Bob is thinking…
          </div>
        )}

        {askError && !asking && (
          <div
            className="dispatch__qa-loading"
            style={{
              color: 'var(--risk-high)',
            }}
          >
            Bob could not be reached. Check the backend connection.
          </div>
        )}

        <form
          className="dispatch__ask-form"
          onSubmit={handleAsk}
        >
          <textarea
            className="dispatch__ask-input"
            rows={1}
            placeholder="e.g. which asset needs attention first?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey
              ) {
                e.preventDefault();
                handleAsk(e);
              }
            }}
          />

          <button
            type="submit"
            className="btn btn--primary"
            disabled={
              asking ||
              !question.trim()
            }
          >
            {asking ? 'Asking…' : 'Ask'}
          </button>
        </form>

      </div>

    </div>
  );
}