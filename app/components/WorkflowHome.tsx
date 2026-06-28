"use client";

const STEPS = [
  { n: 1, title: "甲方原声带", desc: "先把原话完整接住" },
  { n: 2, title: "他说出口的 & 他真正担心的", desc: "把明话和潜台词分开" },
  { n: 3, title: "甲方纠结点", desc: "看见客户左右为难的地方" },
  { n: 4, title: "提前替客户想一遍", desc: "不是挑刺,是先补逻辑" },
  { n: 5, title: "还得问甲方爸爸", desc: "有些点不能猜,要问准" },
  { n: 6, title: "先给甲方看这几个方向", desc: "先定方向,再开工" },
  { n: 7, title: "接下来谁动手", desc: "把方向拆成团队动作" },
];

export function WorkflowHome({
  hasResult,
  onNewSignal,
  onPickStep,
}: {
  hasResult: boolean;
  onNewSignal: () => void;
  onPickStep: (step: number) => void;
}) {
  function handle(step: number) {
    if (hasResult) onPickStep(step);
    else onNewSignal();
  }

  return (
    <section className="view workflow-view active">
      <div className="workflow-shell">
        <div className="workflow-head">
          <div>
            <div className="label">Workflow Home</div>
            <h2>解码工作台</h2>
            <p>选择一个步骤直接进入,也可以先放入一段新的甲方爸爸的话。</p>
          </div>
          <button className="btn-primary" onClick={onNewSignal}>
            甲方爸爸的话
          </button>
        </div>
        <div className="workflow-grid">
          {STEPS.map((s) =>
            s.n === 7 ? (
              <button
                key={s.n}
                className="workflow-card final-entry"
                onClick={() => handle(s.n)}
              >
                <span className="index">{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </button>
            ) : (
              <button
                key={s.n}
                className="workflow-card"
                onClick={() => handle(s.n)}
              >
                <span className="index">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </button>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
