use std::net::SocketAddr;

use http_body_util::{BodyExt, Full, LengthLimitError, Limited};
use hyper::body::{Bytes, Incoming};
use hyper::header::{
    HeaderMap, HeaderName, ALLOW, AUTHORIZATION, CONTENT_TYPE, HOST, ORIGIN, RETRY_AFTER,
    WWW_AUTHENTICATE,
};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;

use crate::mcp_bridge::{BridgedResponse, ForwardError, McpBridge, MAX_BODY_BYTES, PORT};

const PATH: &str = "/mcp";
const FORWARDED_HEADERS: [&str; 5] = [
    "authorization",
    "accept",
    "content-type",
    "mcp-session-id",
    "mcp-protocol-version",
];
const BEARER_PREFIX: &str = "Bearer finito_mcp_";
const TOKEN_HEX_LENGTH: usize = 64;
const BEARER_CHALLENGE: &str = "Bearer realm=\"finito\", error=\"invalid_token\"";

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let address = SocketAddr::from(([127, 0, 0, 1], PORT));
        let listener = match TcpListener::bind(address).await {
            Ok(listener) => listener,
            Err(error) => {
                log::warn!("MCP listener cannot bind {address}: {error}");
                return;
            }
        };
        app.state::<McpBridge>().mark_listening();

        loop {
            let Ok((stream, _)) = listener.accept().await else {
                continue;
            };
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let service = service_fn(|request| respond(app.clone(), request));
                let _ = http1::Builder::new()
                    .serve_connection(TokioIo::new(stream), service)
                    .await;
            });
        }
    });
}

async fn respond(
    app: AppHandle,
    request: Request<Incoming>,
) -> Result<Response<Full<Bytes>>, hyper::Error> {
    Ok(answer(app, request).await)
}

async fn answer(app: AppHandle, request: Request<Incoming>) -> Response<Full<Bytes>> {
    if request.uri().path() != PATH {
        return status_only(StatusCode::NOT_FOUND);
    }
    if !is_loopback_host(request.headers()) || request.headers().contains_key(ORIGIN) {
        return json_rpc_error(StatusCode::FORBIDDEN, "Forbidden.", &[]);
    }
    if request.method() != Method::POST {
        return json_rpc_error(
            StatusCode::METHOD_NOT_ALLOWED,
            "Method not allowed.",
            &[(ALLOW, "POST")],
        );
    }
    if !carries_agent_token(request.headers()) {
        return json_rpc_error(
            StatusCode::UNAUTHORIZED,
            "Missing bearer token.",
            &[(WWW_AUTHENTICATE, BEARER_CHALLENGE)],
        );
    }

    let (parts, body) = request.into_parts();
    let bytes = match Limited::new(body, MAX_BODY_BYTES).collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(error) if error.downcast_ref::<LengthLimitError>().is_some() => {
            return status_only(StatusCode::PAYLOAD_TOO_LARGE);
        }
        Err(_) => return status_only(StatusCode::BAD_REQUEST),
    };
    let Ok(body) = String::from_utf8(bytes.to_vec()) else {
        return status_only(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    };

    let bridge = app.state::<McpBridge>();
    let forwarded = bridge
        .forward(
            &app,
            parts.method.to_string(),
            parts.uri.to_string(),
            forwarded_headers(&parts.headers),
            body,
        )
        .await;

    match forwarded {
        Ok(response) => bridged(response),
        Err(ForwardError::WebviewNotReady) | Err(ForwardError::TooManyInFlight) => json_rpc_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "The finito app is not ready.",
            &[(RETRY_AFTER, "5")],
        ),
        Err(ForwardError::Timeout) => status_only(StatusCode::GATEWAY_TIMEOUT),
    }
}

fn is_loopback_host(headers: &HeaderMap) -> bool {
    let Some(host) = headers.get(HOST).and_then(|value| value.to_str().ok()) else {
        return false;
    };
    host == format!("127.0.0.1:{PORT}") || host == format!("localhost:{PORT}")
}

fn carries_agent_token(headers: &HeaderMap) -> bool {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix(BEARER_PREFIX))
        .is_some_and(|hex| {
            hex.len() == TOKEN_HEX_LENGTH
                && hex
                    .bytes()
                    .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
        })
}

fn forwarded_headers(headers: &HeaderMap) -> Vec<[String; 2]> {
    headers
        .iter()
        .filter(|(name, _)| FORWARDED_HEADERS.contains(&name.as_str()))
        .map(|(name, value)| {
            [
                name.to_string(),
                String::from_utf8_lossy(value.as_bytes()).into_owned(),
            ]
        })
        .collect()
}

fn status_only(status: StatusCode) -> Response<Full<Bytes>> {
    Response::builder()
        .status(status)
        .body(Full::default())
        .expect("a response with only a status is always valid")
}

fn json_rpc_error(
    status: StatusCode,
    message: &str,
    extra_headers: &[(HeaderName, &str)],
) -> Response<Full<Bytes>> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "error": { "code": -32000, "message": message },
        "id": serde_json::Value::Null,
    })
    .to_string();
    let mut builder = Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "application/json");
    for (name, value) in extra_headers {
        builder = builder.header(name.clone(), *value);
    }
    builder
        .body(Full::new(Bytes::from(body)))
        .expect("a JSON-RPC error response with static headers is always valid")
}

fn bridged(response: BridgedResponse) -> Response<Full<Bytes>> {
    let status = StatusCode::from_u16(response.status).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut builder = Response::builder().status(status);
    for [name, value] in response.headers {
        builder = builder.header(name, value);
    }
    builder
        .body(Full::new(Bytes::from(response.body)))
        .unwrap_or_else(|_| status_only(StatusCode::BAD_GATEWAY))
}

#[cfg(test)]
mod tests {
    use super::*;
    use hyper::header::HeaderValue;

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for (name, value) in pairs {
            headers.append(
                HeaderName::from_bytes(name.as_bytes()).unwrap(),
                HeaderValue::from_str(value).unwrap(),
            );
        }
        headers
    }

    #[test]
    fn accepts_only_the_loopback_host_with_the_listener_port() {
        assert!(is_loopback_host(&headers(&[("host", "127.0.0.1:41414")])));
        assert!(is_loopback_host(&headers(&[("host", "localhost:41414")])));
        assert!(!is_loopback_host(&headers(&[("host", "127.0.0.1")])));
        assert!(!is_loopback_host(&headers(&[("host", "finito.example:41414")])));
        assert!(!is_loopback_host(&headers(&[])));
    }

    #[test]
    fn recognises_the_agent_token_shape_before_crossing_into_the_webview() {
        let token = format!("Bearer finito_mcp_{}", "a1".repeat(32));
        assert!(carries_agent_token(&headers(&[("authorization", &token)])));

        let uppercase = format!("Bearer finito_mcp_{}", "A1".repeat(32));
        assert!(!carries_agent_token(&headers(&[("authorization", &uppercase)])));
        let short = format!("Bearer finito_mcp_{}", "a1".repeat(31));
        assert!(!carries_agent_token(&headers(&[("authorization", &short)])));
        assert!(!carries_agent_token(&headers(&[("authorization", "Bearer sk-1234")])));
        assert!(!carries_agent_token(&headers(&[])));
    }

    #[test]
    fn forwards_only_the_allowlisted_headers() {
        let forwarded = forwarded_headers(&headers(&[
            ("authorization", "Bearer x"),
            ("accept", "application/json, text/event-stream"),
            ("cookie", "session=1"),
            ("content-type", "application/json"),
            ("x-forwarded-for", "10.0.0.1"),
        ]));
        assert_eq!(
            forwarded,
            vec![
                ["authorization".to_string(), "Bearer x".to_string()],
                [
                    "accept".to_string(),
                    "application/json, text/event-stream".to_string()
                ],
                ["content-type".to_string(), "application/json".to_string()],
            ]
        );
    }
}
