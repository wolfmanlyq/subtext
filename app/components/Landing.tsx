"use client";

export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <section className="view landing active">
      <header className="landing-nav" aria-label="产品导航">
        <div className="nav-brand">
          <div className="nav-mark">⌁</div>
          <div>
            <strong>言外之意 Subtext</strong>
            <span>Client Feedback Decoder</span>
          </div>
        </div>
        <div className="nav-actions">
          <span className="demo-pill">Demo Mode</span>
          <button className="nav-login" type="button" onClick={onStart}>
            Sign in / 进入工作台
          </button>
        </div>
      </header>
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
