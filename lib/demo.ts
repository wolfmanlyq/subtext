export interface AnalyzeInput {
  feedback: string;
  projectType: string;
  stage: string;
  audience: string;
  clientStyle: string;
  industry?: string;
  brandName?: string;
  clientRole?: string;
}

export const DEMO_INPUT: AnalyzeInput = {
  feedback:
    "白桃冰美式这版海报整体视觉是好看的,夏天的感觉也有了,但是我们看下来觉得“想喝”的感觉还不够强。" +
    "现在更像一张氛围图,产品本身的卖点没有被打出来。还有第二杯半价这个活动信息也有点弱," +
    "用户可能一眼看不到。另外,我们希望年轻一点,但不要做得太网红、太花哨,还是要有一点品牌质感。",
  projectType: "新品推广",
  stage: "初稿反馈",
  audience: "AE / 策划 / 设计 / 客户回复",
  clientStyle: "在意品牌质感,担心过度网红化",
};
