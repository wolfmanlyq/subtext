"use client";
import { useState } from "react";
import { DEMO_INPUT, type AnalyzeInput } from "@/lib/demo";

const SCENES = ["新品上市", "活动促销", "社媒种草", "短视频脚本"];
const STAGES = ["初稿反馈", "二轮修改", "执行前确认"];
const GOALS = ["整理需求", "行动建议", "方向小样", "客户回复"];

interface HistoryFile {
  id: string;
  name: string;
  type: string;
  selected: boolean;
}

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
  const [projectType, setProjectType] = useState("新品上市");
  const [stage, setStage] = useState("初稿反馈");
  const [goals, setGoals] = useState<string[]>(["整理需求"]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [files, setFiles] = useState<HistoryFile[]>([]);

  const customActive = !SCENES.includes(projectType);
  const selectedRefs = files.filter((f) => f.selected).map((f) => f.name);

  function pickScene(s: string) {
    setProjectType(s);
    setCustomOpen(false);
  }
  function confirmCustom() {
    const v = customValue.trim();
    if (!v) return;
    setProjectType(v);
    setCustomOpen(false);
  }
  function toggleGoal(g: string) {
    setGoals((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).map((f, i) => ({
      id: `${Date.now()}-${i}`,
      name: f.name,
      type: (f.name.split(".").pop() ?? "FILE").toUpperCase(),
      selected: false,
    }));
    setFiles((prev) => [...picked, ...prev]);
    e.target.value = "";
  }
  function toggleFile(id: string) {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)),
    );
  }
  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function submit() {
    const refLine = selectedRefs.length
      ? `\n\n[参考材料]${selectedRefs.join("、")}`
      : "";
    onDecode({
      feedback: feedback + refLine,
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
            <h2>甲方爸爸的话</h2>
            <p>把客户微信、邮件、会议纪要或方案批注放进来,不用整理,越原始越真实。</p>
          </div>
          <button className="btn-ghost" onClick={onBack}>
            Back
          </button>
        </div>

        <div className="feedback-wrap">
          <textarea
            aria-label="客户反馈"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="粘贴微信聊天 / 邮件 / 会议纪要 / 方案批注……"
          />
          <button
            type="button"
            className="history-btn"
            onClick={() => setDrawerOpen(true)}
          >
            ⌁ 历史记录
          </button>
        </div>
        {selectedRefs.length > 0 && (
          <div className="selected-ref">
            已选择参考材料:{selectedRefs.join(" / ")}
          </div>
        )}

        <div className="chip-groups">
          <div className="chip-group option-card">
            <div className="chip-title">项目场景</div>
            <div className="chips">
              {SCENES.map((s) => (
                <button
                  key={s}
                  className={`chip${projectType === s ? " active" : ""}`}
                  onClick={() => pickScene(s)}
                >
                  {s}
                </button>
              ))}
              <button
                className={`chip${customActive ? " active" : ""}`}
                onClick={() => setCustomOpen(true)}
              >
                {customActive ? projectType : "自定义"}
              </button>
            </div>
            {customOpen && (
              <div className="custom-scene show">
                <input
                  aria-label="自定义场景"
                  placeholder="输入项目场景"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmCustom()}
                />
                <button className="btn-ghost" onClick={confirmCustom}>
                  确认
                </button>
              </div>
            )}
          </div>

          <div className="chip-group option-card">
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

          <div className="chip-group option-card">
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

      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="history-drawer" aria-label="历史甲方原话">
            <div className="drawer-head">
              <div>
                <div className="label">Local References</div>
                <h2>历史甲方原话</h2>
                <p>上传本地文件作为本次解码的参考材料(仅前端演示,不上传服务器)。</p>
              </div>
              <button className="btn-ghost" onClick={() => setDrawerOpen(false)}>
                关闭
              </button>
            </div>

            <label className="upload-zone">
              <strong>点击上传历史材料</strong>
              <span>支持 PDF / 图片 / PPTX / Word / Excel</span>
              <small>文件仅用于当前浏览器演示。</small>
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt"
                onChange={onUpload}
              />
            </label>

            <div className="file-list">
              {files.length === 0 ? (
                <div className="empty-files">还没有上传文件。</div>
              ) : (
                files.map((f) => (
                  <div key={f.id} className={`file-card${f.selected ? " active" : ""}`}>
                    <div className="file-icon">{f.type}</div>
                    <div>
                      <div className="file-name" title={f.name}>
                        {f.name}
                      </div>
                      <div className="file-info">
                        {f.selected ? "已作为参考材料" : "等待选用"}
                      </div>
                      <div className="file-actions">
                        <button onClick={() => toggleFile(f.id)}>
                          {f.selected ? "取消选用" : "使用此文件"}
                        </button>
                        <button onClick={() => removeFile(f.id)}>移除</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="drawer-actions">
              <button onClick={() => setDrawerOpen(false)}>确认使用</button>
            </div>
          </aside>
        </>
      )}
    </section>
  );
}
