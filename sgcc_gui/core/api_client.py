from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from sgcc_gui.core.exceptions import RequestError
from sgcc_gui.core.models import OrgNode
from sgcc_gui.core.utils import generate_random_cookie

try:
    import requests
except ModuleNotFoundError:  # pragma: no cover - exercised only in dependency-light environments.
    requests = None


WINDOWS_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/138.0.0.0 Safari/537.36"
)


@dataclass(slots=True)
class PayloadCandidate:
    mode: str
    value: Any


class _FallbackCookies(dict):
    def set(self, key: str, value: str) -> None:
        self[key] = value


class _FallbackSession:
    def __init__(self) -> None:
        self.cookies = _FallbackCookies()

    def request(self, *args, **kwargs) -> Any:
        raise RequestError("缺少 requests 依赖，请先安装 requirements.txt。")


REQUEST_EXCEPTION_TYPES = (requests.RequestException, RequestError) if requests else (RequestError,)
RESPONSE_TYPE = requests.Response if requests else object


class SGCCApiClient:
    def __init__(
        self,
        session: requests.Session | None = None,
        logger: Callable[[str], None] | None = None,
        retry_limit: int = 3,
    ) -> None:
        if session is not None:
            self.session = session
        elif requests is not None:
            self.session = requests.Session()
        else:
            self.session = _FallbackSession()
        self.logger = logger
        self.retry_limit = retry_limit
        self.base_url = "https://ecp.sgcc.com.cn/ecp2.0/ecpwcmcore//index"
        self.pdf_base_url = "https://ecp.sgcc.com.cn/ecp2.0/ecpwcmcore/index/showPDF?filePath="
        self.headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Connection": "keep-alive",
            "Content-Type": "application/json",
            "Origin": "https://ecp.sgcc.com.cn",
            "Referer": "https://ecp.sgcc.com.cn/ecp2.0/portal/",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "User-Agent": WINDOWS_USER_AGENT,
            "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
            "sec-ch-ua-mobile": "?0",
            'sec-ch-ua-platform': '"Windows"',
        }
        self._update_cookie(generate_random_cookie())

    def _log(self, message: str) -> None:
        if self.logger:
            self.logger(message)

    def _update_cookie(self, cookie: str) -> None:
        cookie_value = cookie.split("=")[1] if "=" in cookie else cookie
        self.session.cookies.set("JSESSIONID", cookie_value)

    def _request_with_retry(
        self,
        method: str,
        url: str,
        *,
        json_data: Any | None = None,
        raw_data: Any | None = None,
        stream: bool = False,
        timeout: int = 15,
        expect_json: bool = True,
        headers: dict[str, str] | None = None,
    ) -> Any:
        last_error: Exception | None = None
        merged_headers = headers or self.headers

        for attempt in range(1, self.retry_limit + 1):
            try:
                response = self.session.request(
                    method=method,
                    url=url,
                    json=json_data,
                    data=raw_data,
                    headers=merged_headers,
                    timeout=timeout,
                    stream=stream,
                )
                if response.status_code == 403:
                    self._update_cookie(generate_random_cookie())
                    raise RequestError("403 Forbidden，已刷新 Cookie。")
                response.raise_for_status()
                if stream:
                    return response
                if not expect_json:
                    return response.text
                try:
                    return response.json()
                except json.JSONDecodeError as exc:
                    raise RequestError("接口返回了无法解析的 JSON 数据。") from exc
            except REQUEST_EXCEPTION_TYPES as exc:
                last_error = exc
                self._log(f"请求失败，第 {attempt}/{self.retry_limit} 次重试：{exc}")
                self._update_cookie(generate_random_cookie())

        raise RequestError(str(last_error) if last_error else "请求失败。")

    def _post_candidates(self, endpoint: str, candidates: list[PayloadCandidate]) -> Any:
        last_error: Exception | None = None
        url = f"{self.base_url}/{endpoint}"
        for candidate in candidates:
            try:
                if candidate.mode == "json":
                    return self._request_with_retry("POST", url, json_data=candidate.value)
                if candidate.mode == "data":
                    return self._request_with_retry("POST", url, raw_data=candidate.value)
                raise RequestError(f"未知的 payload 模式: {candidate.mode}")
            except RequestError as exc:
                last_error = exc
        raise RequestError(str(last_error) if last_error else f"{endpoint} 请求失败。")

    def _extract_list(self, data: Any) -> list[dict[str, Any]]:
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        if not isinstance(data, dict):
            return []
        for key in ("resultValue", "data", "rows", "list", "treeList", "orgList", "children"):
            value = data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
            if isinstance(value, dict):
                nested = self._extract_list(value)
                if nested:
                    return nested
        return []

    def _parse_org_nodes(self, data: Any, parent_id: str | None = None) -> list[OrgNode]:
        nodes: list[OrgNode] = []
        for item in self._extract_list(data):
            org_id = str(
                item.get("orgId")
                or item.get("id")
                or item.get("value")
                or item.get("orgCode")
                or ""
            ).strip()
            name = str(
                item.get("orgName")
                or item.get("name")
                or item.get("label")
                or item.get("title")
                or ""
            ).strip()
            if not org_id or not name:
                continue
            has_children = bool(
                item.get("hasChildren")
                or item.get("isParent")
                or item.get("childFlag")
                or item.get("children")
            )
            if "leaf" in item:
                has_children = not bool(item["leaf"])
            nodes.append(
                OrgNode(
                    id=org_id,
                    name=name,
                    parent_id=parent_id,
                    has_children=has_children,
                    raw=item,
                )
            )
        return nodes

    def load_org_roots(self) -> list[OrgNode]:
        data = self._post_candidates(
            "orgTreeNew",
            [
                PayloadCandidate("json", {}),
                PayloadCandidate("json", {"orgId": ""}),
                PayloadCandidate("data", '""'),
                PayloadCandidate("data", ""),
            ],
        )
        return self._parse_org_nodes(data)

    def load_org_children(self, parent_id: str) -> list[OrgNode]:
        data = self._post_candidates(
            "orgTreeNew",
            [
                PayloadCandidate("json", {"orgId": parent_id}),
                PayloadCandidate("json", {"id": parent_id}),
                PayloadCandidate("data", f'"{parent_id}"'),
            ],
        )
        return self._parse_org_nodes(data, parent_id=parent_id)

    def search_orgs(self, keyword: str) -> list[OrgNode]:
        data = self._post_candidates(
            "orgTreeSearch",
            [
                PayloadCandidate("json", {"orgName": keyword}),
                PayloadCandidate("json", {"keyword": keyword}),
                PayloadCandidate("json", {"key": keyword}),
                PayloadCandidate("data", f'"{keyword}"'),
            ],
        )
        return self._parse_org_nodes(data)

    def get_note_list(
        self,
        *,
        page: int,
        size: int,
        org_id: str,
        org_name: str,
        keyword: str,
    ) -> list[dict[str, Any]]:
        payload = {
            "index": page,
            "size": size,
            "firstPageMenuId": "2018060501171111",
            "orgId": org_id,
            "key": keyword,
            "year": "",
            "orgName": org_name,
        }
        result = self._request_with_retry("POST", f"{self.base_url}/noteList", json_data=payload)
        result_value = result.get("resultValue", {}) if isinstance(result, dict) else {}
        note_list = result_value.get("noteList", [])
        return note_list if isinstance(note_list, list) else []

    def get_notice_win(self, notice_id: str) -> tuple[dict[str, Any], bool]:
        result = self._request_with_retry(
            "POST",
            f"{self.base_url}/getNoticeWin",
            raw_data=f'"{notice_id}"',
        )
        result_value = result.get("resultValue", {}) if isinstance(result, dict) else {}
        file_flag = str(result_value.get("fileFlag", "0"))
        return result_value, file_flag == "1"

    def get_win_file(self, notice_id: str) -> list[dict[str, Any]]:
        result = self._request_with_retry(
            "POST",
            f"{self.base_url}/getWinFile",
            raw_data=f'"{notice_id}"',
        )
        result_value = result.get("resultValue", {}) if isinstance(result, dict) else {}
        files = result_value.get("files", [])
        return files if isinstance(files, list) else []

    def download_file(
        self,
        pdf_url: str,
        destination: Path,
        progress_cb: Callable[[int, int], None] | None = None,
    ) -> None:
        response = self._request_with_retry(
            "GET",
            pdf_url,
            stream=True,
            timeout=30,
            expect_json=False,
            headers={**self.headers, "Referer": "https://ecp.sgcc.com.cn/ecp2.0/portal/"},
        )
        if not isinstance(response, RESPONSE_TYPE):
            raise RequestError("下载接口返回异常。")

        total = int(response.headers.get("content-length", "0") or 0)
        downloaded = 0
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as file_obj:
            for chunk in response.iter_content(chunk_size=8192):
                if not chunk:
                    continue
                file_obj.write(chunk)
                downloaded += len(chunk)
                if progress_cb:
                    progress_cb(downloaded, total)
