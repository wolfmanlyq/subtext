"use client";
import type { ActionCard as Card } from "@/lib/schema";

const PRIORITY_COLOR: Record<string, string> = {
  必须修改: "#e5484d",
  建议优化: "#f5a623",
  需确认: "#3aa675",
};

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="block">
      <h4>{title}</h4>
      <ul>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function ActionCard({ card }: { card: Card }) {
  if (card.needMoreInfo) {
    return (
      <section className="card warn">
        <h3>需要补充信息</h3>
        <ul>
          {card.questionsToAsk.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className="card">
      <h3>一句话翻译</h3>
      <p className="translation">{card.oneLineTranslation}</p>
      <List title="显性需求" items={card.explicitNeeds} />
      <List title="隐性诉求" items={card.implicitNeeds} />
      {card.coreConflict && (
        <div className="block">
          <h4>核心矛盾</h4>
          <p>{card.coreConflict}</p>
        </div>
      )}
      <List title="反馈类型" items={card.feedbackTypes} />

      <div className="block">
        <h4>方案修改清单</h4>
        {card.items.map((it, i) => (
          <div className="item" key={i}>
            <span
              className="badge"
              style={{ background: PRIORITY_COLOR[it.priority] }}
            >
              {it.priority}
            </span>
            <span className="desc">{it.desc}</span>
            <span className="roles">{it.roles.join("、")}</span>
            {it.risk && <div className="risk">风险:{it.risk}</div>}
          </div>
        ))}
      </div>

      <List title="需要反问客户" items={card.questionsToAsk} />

      <div className="block">
        <h4>客户回复话术</h4>
        <p className="reply">{card.replyScript}</p>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(card.replyScript)}
        >
          复制话术
        </button>
      </div>
    </section>
  );
}
