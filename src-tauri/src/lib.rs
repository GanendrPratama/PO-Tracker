use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use reqwest::Client;
use std::collections::HashMap;
use tiny_http::{Server, Response};

// Data structures for SMTP settings
#[derive(Debug, Serialize, Deserialize)]
pub struct SmtpSettings {
    pub smtp_server: String,
    pub smtp_port: i32,
    pub username: String,
    pub password: String,
    pub from_email: String,
    pub from_name: Option<String>,
}

// Google OAuth structures
#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleAuthConfig {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub token_type: String,
    pub scope: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleUserInfo {
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleFormResponse {
    #[serde(rename = "formId")]
    pub form_id: String,
    #[serde(rename = "responderUri")]
    pub responder_uri: String,
    pub info: GoogleFormInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleFormInfo {
    pub title: String,
    #[serde(rename = "documentTitle")]
    pub document_title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FormResponsesData {
    pub responses: Option<Vec<FormResponse>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FormResponse {
    #[serde(rename = "responseId")]
    pub response_id: String,
    #[serde(rename = "createTime")]
    pub create_time: String,
    pub answers: Option<HashMap<String, AnswerData>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnswerData {
    #[serde(rename = "questionId")]
    pub question_id: String,
    #[serde(rename = "textAnswers")]
    pub text_answers: Option<TextAnswers>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TextAnswers {
    pub answers: Vec<TextAnswer>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TextAnswer {
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleFormDetails {
    #[serde(rename = "formId")]
    pub form_id: String,
    pub items: Option<Vec<FormItem>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FormItem {
    #[serde(rename = "itemId")]
    pub item_id: String,
    pub title: Option<String>,
    #[serde(rename = "questionItem")]
    pub question_item: Option<QuestionItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QuestionItem {
    pub question: Question,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Question {
    #[serde(rename = "questionId")]
    pub question_id: String,
}

// Generate unique confirmation code
#[tauri::command]
fn generate_confirmation_code() -> String {
    Uuid::new_v4()
        .to_string()
        .chars()
        .take(8)
        .collect::<String>()
        .to_uppercase()
}

// Send email with invoice
#[tauri::command]
fn send_invoice_email(
    smtp_settings: SmtpSettings,
    to_email: String,
    to_name: String,
    subject: String,
    html_body: String,
) -> Result<String, String> {
    let from_name = smtp_settings
        .from_name
        .unwrap_or_else(|| "POTracker".to_string());

    let email = Message::builder()
        .from(
            format!("{} <{}>", from_name, smtp_settings.from_email)
                .parse()
                .map_err(|e| format!("Invalid from address: {}", e))?,
        )
        .to(format!("{} <{}>", to_name, to_email)
            .parse()
            .map_err(|e| format!("Invalid to address: {}", e))?)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(html_body)
        .map_err(|e| format!("Failed to build email: {}", e))?;

    let creds = Credentials::new(smtp_settings.username.clone(), smtp_settings.password.clone());

    let mailer = SmtpTransport::relay(&smtp_settings.smtp_server)
        .map_err(|e| format!("Failed to create SMTP transport: {}", e))?
        .port(smtp_settings.smtp_port as u16)
        .credentials(creds)
        .build();

    mailer
        .send(&email)
        .map_err(|e| format!("Failed to send email: {}", e))?;

    Ok("Email sent successfully".to_string())
}

// Send email via Gmail API
#[tauri::command]
async fn send_gmail_email(
    access_token: String,
    to_email: String,
    to_name: String,
    from_email: String,
    from_name: String,
    subject: String,
    html_body: String,
) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE};
    
    // Create RFC 2822 email
    let email_content = format!(
        "From: {} <{}>\r\nTo: {} <{}>\r\nSubject: {}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{}",
        from_name, from_email, to_name, to_email, subject, html_body
    );
    
    // Base64 URL-safe encode the email
    let encoded_email = URL_SAFE.encode(email_content.as_bytes());
    
    let client = Client::new();
    
    let body = serde_json::json!({
        "raw": encoded_email
    });
    
    let response = client
        .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        .bearer_auth(&access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to send email via Gmail: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Gmail API error: {}", error_text));
    }
    
    Ok("Email sent successfully via Gmail".to_string())
}

// Start OAuth callback server and get authorization URL
#[tauri::command]
async fn start_oauth_flow(client_id: String) -> Result<serde_json::Value, String> {
    // Try to find an available port starting from 8080
    let mut port = 8080;
    let max_port = 8090;
    
    // Check for available port by trying to bind
    while port <= max_port {
        if std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok() {
            break;
        }
        port += 1;
    }
    
    if port > max_port {
        return Err("Could not find an available port for OAuth callback".to_string());
    }
    
    let redirect_uri = format!("http://localhost:{}/callback", port);
    
    let scopes = [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/forms.body",
        "https://www.googleapis.com/auth/forms.responses.readonly",
        "https://www.googleapis.com/auth/gmail.send",
    ].join(" ");
    
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        client_id,
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&scopes)
    );
    
    Ok(serde_json::json!({
        "auth_url": auth_url,
        "port": port
    }))
}

// Wait for OAuth callback and return the authorization code
#[tauri::command]
async fn wait_for_oauth_callback(port: u16) -> Result<String, String> {
    let server = Server::http(format!("127.0.0.1:{}", port))
        .map_err(|e| format!("Failed to start callback server: {}", e))?;
    
    // Wait for a single request
    for request in server.incoming_requests() {
        let url = request.url().to_string();
        
        // Send success response to browser
        let response_html = r#"
            <!DOCTYPE html>
            <html>
            <head>
                <title>Authentication Successful</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                        background: white;
                        padding: 3rem;
                        border-radius: 1rem;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        text-align: center;
                    }
                    h1 { color: #667eea; margin: 0 0 1rem 0; }
                    p { color: #666; margin: 0; }
                    .checkmark {
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        display: block;
                        stroke-width: 2;
                        stroke: #4bb71b;
                        stroke-miterlimit: 10;
                        margin: 0 auto 1rem;
                        box-shadow: inset 0px 0px 0px #4bb71b;
                        animation: fill .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both;
                    }
                    .checkmark__circle {
                        stroke-dasharray: 166;
                        stroke-dashoffset: 166;
                        stroke-width: 2;
                        stroke-miterlimit: 10;
                        stroke: #4bb71b;
                        fill: none;
                        animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
                    }
                    .checkmark__check {
                        transform-origin: 50% 50%;
                        stroke-dasharray: 48;
                        stroke-dashoffset: 48;
                        animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
                    }
                    @keyframes stroke {
                        100% { stroke-dashoffset: 0; }
                    }
                    @keyframes scale {
                        0%, 100% { transform: none; }
                        50% { transform: scale3d(1.1, 1.1, 1); }
                    }
                    @keyframes fill {
                        100% { box-shadow: inset 0px 0px 0px 30px #4bb71b; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                        <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                    </svg>
                    <h1>✅ Authentication Successful!</h1>
                    <p>You can close this window and return to POTracker.</p>
                </div>
            </body>
            </html>
        "#;
        
        let _ = request.respond(Response::from_string(response_html)
            .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap()));
        
        // Parse the code from the URL
        if let Some(code_start) = url.find("code=") {
            let code_part = &url[code_start + 5..];
            let code = if let Some(amp_pos) = code_part.find('&') {
                &code_part[..amp_pos]
            } else {
                code_part
            };
            
            return Ok(code.to_string());
        }
        
        return Err("No authorization code found in callback".to_string());
    }
    
    Err("Server stopped without receiving callback".to_string())
}

// Generate Google OAuth URL (deprecated - use start_oauth_flow instead)
#[tauri::command]
fn get_google_auth_url(client_id: String, redirect_uri: String) -> String {
    let scopes = [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/forms.body",
        "https://www.googleapis.com/auth/forms.responses.readonly",
        "https://www.googleapis.com/auth/gmail.send",
    ].join(" ");
    
    format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        client_id,
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&scopes)
    )
}

// Exchange authorization code for tokens
#[tauri::command]
async fn exchange_google_code(
    code: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
) -> Result<GoogleTokenResponse, String> {
    let client = Client::new();
    
    let params = [
        ("code", code.as_str()),
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("grant_type", "authorization_code"),
    ];
    
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to exchange code: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {}", error_text));
    }
    
    response
        .json::<GoogleTokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))
}

// Refresh access token
#[tauri::command]
async fn refresh_google_token(
    refresh_token: String,
    client_id: String,
    client_secret: String,
) -> Result<GoogleTokenResponse, String> {
    let client = Client::new();
    
    let params = [
        ("refresh_token", refresh_token.as_str()),
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("grant_type", "refresh_token"),
    ];
    
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed: {}", error_text));
    }
    
    response
        .json::<GoogleTokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))
}

// Get user info from Google
#[tauri::command]
async fn get_google_user_info(access_token: String) -> Result<GoogleUserInfo, String> {
    let client = Client::new();
    
    let response = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to get user info: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to get user info: {}", error_text));
    }
    
    response
        .json::<GoogleUserInfo>()
        .await
        .map_err(|e| format!("Failed to parse user info: {}", e))
}

// Create a Google Form
#[tauri::command]
async fn create_google_form(
    access_token: String,
    title: String,
) -> Result<GoogleFormResponse, String> {
    let client = Client::new();
    
    let body = serde_json::json!({
        "info": {
            "title": title
        }
    });
    
    let response = client
        .post("https://forms.googleapis.com/v1/forms")
        .bearer_auth(&access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to create form: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to create form: {}", error_text));
    }
    
    response
        .json::<GoogleFormResponse>()
        .await
        .map_err(|e| format!("Failed to parse form response: {}", e))
}

// Add questions to a Google Form
#[tauri::command]
async fn add_form_questions(
    access_token: String,
    form_id: String,
    questions: Vec<serde_json::Value>,
) -> Result<String, String> {
    let client = Client::new();
    
    // Build batch update request
    let mut requests: Vec<serde_json::Value> = vec![
        // Add customer name question
        serde_json::json!({
            "createItem": {
                "item": {
                    "title": "Your Name",
                    "questionItem": {
                        "question": {
                            "required": true,
                            "textQuestion": {
                                "paragraph": false
                            }
                        }
                    }
                },
                "location": { "index": 0 }
            }
        }),
        // Add customer email question
        serde_json::json!({
            "createItem": {
                "item": {
                    "title": "Your Email",
                    "questionItem": {
                        "question": {
                            "required": true,
                            "textQuestion": {
                                "paragraph": false
                            }
                        }
                    }
                },
                "location": { "index": 1 }
            }
        }),
    ];
    
    // Add product quantity questions
    for (idx, question) in questions.iter().enumerate() {
        requests.push(serde_json::json!({
            "createItem": {
                "item": {
                    "title": format!("Quantity: {}", question["name"].as_str().unwrap_or("Product")),
                    "description": format!("Price: ${:.2}", question["price"].as_f64().unwrap_or(0.0)),
                    "questionItem": {
                        "question": {
                            "required": false,
                            "textQuestion": {
                                "paragraph": false
                            }
                        }
                    }
                },
                "location": { "index": idx + 2 }
            }
        }));
    }
    
    let body = serde_json::json!({
        "requests": requests
    });
    
    let response = client
        .post(format!("https://forms.googleapis.com/v1/forms/{}:batchUpdate", form_id))
        .bearer_auth(&access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to add questions: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to add questions: {}", error_text));
    }
    
    Ok("Questions added successfully".to_string())
}

// Get form responses
#[tauri::command]
async fn get_form_responses(
    access_token: String,
    form_id: String,
) -> Result<FormResponsesData, String> {
    let client = Client::new();
    
    let response = client
        .get(format!("https://forms.googleapis.com/v1/forms/{}/responses", form_id))
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to get responses: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to get responses: {}", error_text));
    }
    
    response
        .json::<FormResponsesData>()
        .await
        .map_err(|e| format!("Failed to parse responses: {}", e))
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        s.chars()
            .map(|c| match c {
                'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
                ' ' => "%20".to_string(),
                _ => format!("%{:02X}", c as u8),
            })
            .collect()
    }
}

// Get form details (schema)
#[tauri::command]
async fn get_form_details(
    access_token: String,
    form_id: String,
) -> Result<GoogleFormDetails, String> {
    let client = Client::new();

    let response = client
        .get(format!("https://forms.googleapis.com/v1/forms/{}", form_id))
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to get form details: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to get form details: {}", error_text));
    }

    response
        .json::<GoogleFormDetails>()
        .await
        .map_err(|e| format!("Failed to parse form details: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            generate_confirmation_code,
            send_invoice_email,
            send_gmail_email,
            start_oauth_flow,
            wait_for_oauth_callback,
            get_google_auth_url,
            exchange_google_code,
            refresh_google_token,
            get_google_user_info,
            create_google_form,
            add_form_questions,
            get_form_responses,
            get_form_details
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
