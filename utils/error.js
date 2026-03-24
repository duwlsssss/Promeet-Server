/**
 *  공통 에러 응답 함수
 */
export function sendError(res, code, message, status = 400) {
  return res.status(status).json({ success: false, error: { code, message } });
}