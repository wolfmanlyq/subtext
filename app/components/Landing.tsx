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
          客户不是觉得画面不好看,
          <br />
          而是担心广告<strong>好看但不卖货</strong>。
        </p>
        <button className="btn-primary" onClick={onStart}>
          Start Now 开始解码
        </button>
      </div>
    </section>
  );
}
