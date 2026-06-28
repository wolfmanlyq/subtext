"use client";

export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <section className="view landing active">
      <div className="landing-inner">
        <div className="brand-logo">
          <div className="label">Client Feedback Decoder</div>
          <h1>言外之意</h1>
          <span>Subtext</span>
        </div>
        <p className="slogan">
          听懂客户没说出口的部分,
          <br />
          把模糊反馈变成下一步行动。
        </p>
        <button className="btn-primary" onClick={onStart}>
          Start Now 开始解码
        </button>
      </div>
    </section>
  );
}
