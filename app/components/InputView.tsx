"use client";
import { useState } from "react";
import { DEMO_INPUT, type AnalyzeInput } from "@/lib/demo";

const PROJECT_TYPES = ["新品推广", "KOL投放", "品牌海报", "短视频脚本"];
const STAGES = ["初稿反馈", "二轮修改", "执行前确认"];
const GOALS = ["整理需求", "行动建议", "方向小样", "客户回复"];

export function InputView({
  loading,
  onBack,
  onDecode,
}: {
  loading: boolean;
  onBack: () => void;
  onDecode: (input: AnalyzeInput) => void;
}) {
  const [feedback, setFeedback] = useState(DEMO_INPUT.feedback);
  const [projectType, setProjectType] = useState("新品推广");
  const [stage, setStage] = useState("初稿反馈");
  const [goals, setGoals] = useState<string[]>(["整理需求", "行动建议"]);

  function toggleGoal(g: string) {
    setGoals((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  }

  function submit() {
    onDecode({
      feedback,
      projectType,
      stage,
      audience: goals.join(" / "),
      clientStyle: "",
    });
  }

  return (
    <section className="view input-view active">
      <article className="input-card glass">
        <div className="input-head">
          <div>
            <div className="label">Raw Signal</div>
            <h2>放入一段客户信号</h2>
            <p>把微信、邮件、会议纪要或一句模糊反馈丢进来,我们来拆拆它真正想说什么。</p>
          </div>
          <button className="btn-ghost" onClick={onBack}>
            Back
          </button>
        </div>

        <textarea
          aria-label="客户反馈"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="粘贴微信聊天 / 邮件 / 会议纪要 / 方案批注……"
        />

        <div className="chip-groups">
          <div className="chip-group">
            <div className="chip-title">项目类型</div>
            <div className="chips">
              {PROJECT_TYPES.map((t) => (
                <button
                  key={t}
                  className={`chip${projectType === t ? " active" : ""}`}
                  onClick={() => setProjectType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="chip-group">
            <div className="chip-title">当前阶段</div>
            <div className="chips">
              {STAGES.map((t) => (
                <button
                  key={t}
                  className={`chip${stage === t ? " active" : ""}`}
                  onClick={() => setStage(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="chip-group">
            <div className="chip-title">输出目标</div>
            <div className="chips">
              {GOALS.map((t) => (
                <button
                  key={t}
                  className={`chip${goals.includes(t) ? " active" : ""}`}
                  onClick={() => toggleGoal(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="input-actions">
          <span className="label">Agent Input Console</span>
          <button
            className="btn-primary"
            disabled={loading || feedback.trim().length < 4}
            onClick={submit}
          >
            {loading ? "解码中…" : "开始解码 Decode Feedback"}
          </button>
        </div>
      </article>
    </section>
  );
}
