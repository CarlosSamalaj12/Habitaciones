/* ==========================================================================
   COMMON UTILITIES MODULE (FOR ALL SECONDARY VIEWS)
   ========================================================================== */

import { $, escHtml, clampNonNegInt, isDuplicate } from "./utils/helpers.js";
import { nowLocalMySQL, parseAnyDate, msSince, fmtDur, appendActionObs } from "./utils/date.js";
import { APP_BASE, API_BASE, apiGET, apiGetData, apiPOST, nowServerMs, syncServerTime } from "./utils/api.js";
import {
  getAuthToken, getSession, setSession, clearSession, getActor, actorDisplay,
  roleOf, isReadOnlyRole, isAdmin, canReception, canUseMantenimiento,
  canUseLiberar, canUseDecorada, canViewReports
} from "./utils/auth.js";
import { toast } from "./utils/toast.js";

// Global exports for backwards compatibility across classic scripts and inline handlers
if (typeof window !== "undefined") {
  window.$ = $;
  window.escHtml = escHtml;
  window.APP_BASE = APP_BASE;
  window.API_BASE = API_BASE;
  window.apiGET = apiGET;
  window.apiGetData = apiGetData;
  window.apiPOST = apiPOST;
  window.toast = toast;
  window.getAuthToken = getAuthToken;
  window.getSession = getSession;
  window.setSession = setSession;
  window.clearSession = clearSession;
  window.getActor = getActor;
  window.actorDisplay = actorDisplay;
  window.roleOf = roleOf;
  window.isReadOnlyRole = isReadOnlyRole;
  window.isAdmin = isAdmin;
  window.canReception = canReception;
  window.canUseMantenimiento = canUseMantenimiento;
  window.canUseLiberar = canUseLiberar;
  window.canUseDecorada = canUseDecorada;
  window.canViewReports = canViewReports;
  window.nowServerMs = nowServerMs;
  window.syncServerTime = syncServerTime;
  window.nowLocalMySQL = nowLocalMySQL;
  window.parseAnyDate = parseAnyDate;
  window.msSince = msSince;
  window.fmtDur = fmtDur;
  window.appendActionObs = appendActionObs;
}

export {
  $, escHtml, clampNonNegInt, isDuplicate,
  nowLocalMySQL, parseAnyDate, msSince, fmtDur, appendActionObs,
  APP_BASE, API_BASE, apiGET, apiGetData, apiPOST, nowServerMs, syncServerTime,
  getAuthToken, getSession, setSession, clearSession, getActor, actorDisplay,
  roleOf, isReadOnlyRole, isAdmin, canReception, canUseMantenimiento,
  canUseLiberar, canUseDecorada, canViewReports, toast
};
