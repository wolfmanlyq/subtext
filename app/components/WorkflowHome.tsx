"use client";

const STEPS = [
  { n: 1, title: "原话识别", desc: "先听懂客户表面说了什么" },
  { n: 2, title: "需求拆解", desc: "拆开显性需求和隐性诉求" },
  { n: 3, title: "核心矛盾", desc: "看见客户真正拉扯的地方" },
  { n: 4, title: "风险识别", desc: "提前发现返工和误读风险" },
  { n: 5, title: "待确认项", desc: "有些点不能猜,要反问" },
  { n: 6, title: "分岗位执行", desc: "让每个角色知道接下来改什么" },
  { n: 7, title: "最终交付", desc: "生成回复话术、执行清单和方向小样" },
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
    // 已有解码结果才能直达某步;否则先去放入客户信号
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
            <p>选择一个步骤直接进入,也可以先放入一段新的客户信号。</p>
          </div>
          <button className="btn-primary" onClick={onNewSignal}>
            放入客户信号
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
