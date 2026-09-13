import React, { useState } from 'react';
import { askBob } from '../api';

function assetNameFor(assets, assetId) {
  const asset = assets.find((a) => a.asset_id === assetId);
  return asset ? asset.location.name : assetId;
}

export default function DispatchPlan({ plan, assets }) {
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
      setThread((prev) => [...prev, { question: trimmed, answer }]);
    } catch (err) {
      setAskError(true);
      setThread((prev) => [...prev, { question: trimmed, answer: null }]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="dispatch">
      <ol className="dispatch__list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {plan.map((step) => (
          <li key={step.asset_id} className="dispatch__step">
            <span className="dispatch__rank">{step.plan_step.priority_rank}</span>
            <span>
              <div className="dispatch__step-asset">
                {assetNameFor(assets, step.asset_id)} · {step.asset_id}
              </div>
              <div className="dispatch__step-action">{step.plan_step.action}</div>
            </span>
            <span className="dispatch__eta">ETA {step.plan_step.eta_hours}h</span>
          </li>
        ))}
      </ol>

      <div className="dispatch__ask">
        <div className="dispatch__ask-label">Ask Bob about the grid</div>

        {thread.length > 0 && (
          <div className="dispatch__thread">
            {thread.map((qa, i) => (
              <React.Fragment key={i}>
                <div className="dispatch__qa-q">{qa.question}</div>
                {qa.answer ? (
                  <div className="dispatch__qa-a">{qa.answer}</div>
                ) : (
                  <div className="dispatch__qa-a" style={{ borderLeftColor: 'var(--risk-high)', color: 'var(--risk-high)' }}>
                    Couldn't reach Bob for that one — try again.
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {asking && <div className="dispatch__qa-loading">Bob is thinking…</div>}

        <form className="dispatch__ask-form" onSubmit={handleAsk}>
          <textarea
            className="dispatch__ask-input"
            rows={1}
            placeholder="e.g. which asset needs attention first?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                handleAsk(e);
              }
            }}
          />
          <button type="submit" className="btn btn--primary" disabled={asking || !question.trim()}>
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}