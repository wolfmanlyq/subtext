"use client";
import { useState } from "react";
import { DEMO_INPUT, type AnalyzeInput } from "@/lib/demo";
import {
  type Attachment,
  type AttachmentKind,
  MAX_FILE_BYTES,
} from "@/lib/attachment";

const SCENES = ["新品上市", "活动促销", "社媒种草", "短视频脚本"];
const STAGES = ["初稿反馈", "二轮修改", "执行前确认"];
const GOALS = ["整理需求", "行动建议", "方向小样", "客户回复"];

const KIND_BY_MEDIA: Record<string, AttachmentKind> = {
  "text/plain": "text",
  "text/markdown": "text",
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
};

interface LoadedFile {
  id: string;
  name: string;
  kind: AttachmentKind;
  mediaType: Attachment["mediaType"];
  data: string;
  selected: boolean;
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function InputView({
  loading,
  onBack,
  onDecode,
}: {
  loading: boolean;
  onBack: () => void;
  onDecode: (input: AnalyzeInput, attachments: Attachment[]) => void;
}) {
  const [feedback, setFeedback] = useState(DEMO_INPUT.feedback);
  const [projectType, setProjectType] = useState("新品上市");
  const [stage, setStage] = useState("初稿反馈");
  const [goals, setGoals] = useState<string[]>(["整理需求"]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const customActive = !SCENES.includes(projectType);
  const selected = files.filter((f) => f.selected);

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
    setGoals((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setNotice(null);
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const loaded: LoadedFile[] = [];
    for (const file of picked) {
      const kind = KIND_BY_MEDIA[file.type];
      if (!kind) {
        setNotice(`跳过不支持的文件类型:${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setNotice(`跳过过大文件(>4MB):${file.name}`);
        continue;
      }
      const data = kind === "text" ? await readAsText(file) : await readAsBase64(file);
      loaded.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        kind,
        mediaType: file.type as Attachment["mediaType"],
        data,
        selected: false,
      });
    }
    if (loaded.length) setFiles((prev) => [...loaded, ...prev]);
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
    const attachments: Attachment[] = selected.map((f) => ({
      name: f.name,
      kind: f.kind,
      mediaType: f.mediaType,
      data: f.data,
    }));
    onDecode(
      { feedback, projectType, stage, audience: goals.join(" / "), clientStyle: "" },
      attachments,
    );
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
        {selected.length > 0 && (
          <div className="selected-ref">
            已选择参考材料:{selected.map((f) => f.name).join(" / ")}
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
                <p>上传本地文件作为本次解码的参考材料(文本/PDF/图片;在浏览器读取,随解码一起发送)。</p>
              </div>
              <button className="btn-ghost" onClick={() => setDrawerOpen(false)}>
                关闭
              </button>
            </div>

            <label className="upload-zone">
              <strong>点击上传历史材料</strong>
              <span>支持 文本 / PDF / 图片(单文件 ≤ 4MB)</span>
              <small>{notice ?? "文件在浏览器读取后随解码请求发送。"}</small>
              <input
                aria-label="上传历史材料"
                type="file"
                multiple
                accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.webp"
                onChange={onUpload}
              />
            </label>

            <div className="file-list">
              {files.length === 0 ? (
                <div className="empty-files">还没有上传文件。</div>
              ) : (
                files.map((f) => (
                  <div key={f.id} className={`file-card${f.selected ? " active" : ""}`}>
                    <div className="file-icon">{f.kind.toUpperCase()}</div>
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
