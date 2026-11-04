import base from './playwright.config';

// Temporary (2026-11-01): watch-along runs in a maximized window, slowed down to follow.
export default {
  ...base,
  projects: (base.projects ?? []).map((project) => {
    if (project.name === 'setup') return project;
    const { viewport, deviceScaleFactor, isMobile, hasTouch, ...use } = project.use ?? {};
    void viewport; void deviceScaleFactor; void isMobile; void hasTouch;
    return { ...project, use: { ...use, viewport: null, launchOptions: { args: ['--start-maximized'], slowMo: 400 } } };
  }),
};
