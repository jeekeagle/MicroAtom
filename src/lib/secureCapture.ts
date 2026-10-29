const DEFAULT_HTTPS_PORT = '8788';

export const isSecureCaptureContext = () => window.isSecureContext;

export const secureCaptureUrl = () => {
  const url = new URL(window.location.href);
  url.protocol = 'https:';
  url.port = DEFAULT_HTTPS_PORT;
  return url.toString();
};

export const insecureCaptureMessage = () =>
  `局域网访问时，浏览器禁止普通 HTTP 页面使用麦克风。请打开 ${secureCaptureUrl()} 并信任本机证书后再录音。`;
