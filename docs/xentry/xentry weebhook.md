

XentriPay Webhooks
## Integration Guide
This  guide  explains  how  to  use  XentriPay  webhooks  to  receive  real-time  notifications  when  payments,
payouts, and other events happen on your account.
## -
## What Are Webhooks?
## -
How to Register a Webhook
## -
## Managing Your Webhooks
## -
What XentriPay Sends You
## -
## Request Headers
## -
Verifying the Signature
## -
## Retry Policy
## -
## All Event Types
## -
## Delivery Logs
## -
## Best Practices
## 1. What Are Webhooks?
A webhook is a way for XentriPay to automatically notify your application when something important
happens -- for example, when a payment succeeds, a payout is processed, or a refund is completed.
Instead of your application constantly asking XentriPay "did anything happen yet?" (which wastes time and
resources), XentriPay will push a notification directly to your server the moment an event occurs.
How it works in plain terms:
## -
You give XentriPay a URL on your server (your "webhook endpoint").
## -
When an event happens on your account, XentriPay sends an HTTP
## POST
request to that URL.
## -
Your server receives the request, processes the data, and responds with
## 200 OK
## .
- How to Register a Webhook
Send a
## POST
request to the XentriPay API to register your webhook URL.
## Endpoint:
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 2
POST /api/webhooks/set
Required headers:
Content-Type: application/json
## Authorization: Bearer <your_api_token>
Request body:
## JSON
## {
"businessAccountId": 123,
## "url": "https://yourapp.com/webhooks/xentripay",
## "events": [
## "COLLECTION_SUCCESSFUL",
## "PAYOUT_SUCCESS",
## "PAYMENT_REQUEST_COMPLETED"
## ]
## }
FieldTypeDescription
businessAccountIdnumberYour XentriPay business account ID
urlstringThe HTTPS URL on your server that will receive events
eventsarray of stringsThe event types you want to subscribe to (see Section 8)
Example response:
## JSON
## {
## "id": 42,
## "url": "https://yourapp.com/webhooks/xentripay",
"events": ["COLLECTION_SUCCESSFUL", "PAYOUT_SUCCESS", "PAYMENT_REQUEST_COMPLETED"],
"enabled": true,
## "secret": "550e8400-e29b-41d4-a716-446655440000"
## }
Important: Save the secret returned in this response. You will use it to verify that incoming requests truly come
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 3
from  XentriPay.  For  security,  the  secret  is  returned  only  when  you  register  (or  toggle)  a  webhook  --  it  is  not
included when you list your webhooks, so store it securely now.
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 4
## 3. Managing Your Webhooks
View your webhooks
GET /api/webhooks/{businessAccountId}
Returns a list of all webhooks registered for your business account.
Enable or disable a webhook
PUT /api/webhooks/{webhookId}/toggle?status=true
## Set
status=true
to enable or
status=false
to temporarily disable a webhook without deleting it.
View supported event types
GET /api/webhooks/events
Returns all event types currently supported by XentriPay.
- What XentriPay Sends You
When an event occurs, XentriPay makes an HTTP
## POST
request to your registered URL with a JSON body.
Example payload -- a successful collection:
## JSON
## {
"event": "COLLECTION_SUCCESSFUL",
## "data": {
## "id": 9871,
## "amount": 50000,
"currency": "RWF",
"status": "SUCCESSFUL",
"reference": "COL-20240502-9871",
"businessAccountId": 123,
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 5
"createdAt": "2024-05-02T14:32:10Z"
## },
"timestamp": "2024-05-02T14:32:11.034Z",
"idempotencyKey": "COLLECTION_SUCCESSFUL:123:a1b2c3d4-e5f6-7890-abcd-ef1234567890"
## }
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 6
Payload fields:
FieldTypeDescription
eventstringThe name of the event (e.g., COLLECTION_SUCCESSFUL)
dataobjectThe event data -- contents vary by event type
timestampstringISO-8601 UTC timestamp of when the event was sent
idempotencyKeystringA unique ID for this delivery -- use it to avoid processing it twice
## 5. Request Headers
Every webhook request from XentriPay includes these four custom headers:
HeaderExample valuePurpose
X-Xentripay-Signaturesha256=3c9b1f2e...HMAC-SHA256 signature for verification
X-Xentripay-EventCOLLECTION_SUCCESSFULThe event type -- quick reference without parsing body
X-Xentripay-Idempotency-Ke
y
COLLECTION_SUCCESSFUL:123:a
## 1b2-...
Unique delivery ID -- use to deduplicate events
X-Xentripay-Timestamp2024-05-02T14:32:11.034ZTime the event was dispatched
- Verifying the Signature
Always verify the signature. This confirms the request came from XentriPay and the body was not tampered
with.
How it works
## -
XentriPay signs the raw JSON body of the request using your
secret
and the HMAC-SHA256
algorithm.
## -
The result is sent in the
X-Xentripay-Signature
header as
sha256=<hex_value>
## .
## -
On your server, you compute the same HMAC-SHA256 using the raw body and your
secret
## .
## -
If the two values match, the request is authentic.
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 7
Critical: Always compute the HMAC on the raw request body bytes, not a re-serialized version of the parsed
JSON. Parsing and re-serializing can change formatting and will cause the signature check to fail.
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 8
## Verification -- Node.js
## JAVASCRIPT
const crypto = require('crypto');
function verifyWebhookSignature(req, secret) {
const rawBody = req.body; // Must be a raw Buffer/string, not parsed JSON
const receivedSignature = req.headers['x-xentripay-signature']; // e.g. "sha256=abc123..."
const expectedSignature = 'sha256=' + crypto
.createHmac('sha256', secret)
.update(rawBody, 'utf8')
## .digest('hex');
// Use timingSafeEqual to prevent timing attacks
const received = Buffer.from(receivedSignature, 'utf8');
const expected = Buffer.from(expectedSignature, 'utf8');
if (received.length !== expected.length) return false;
return crypto.timingSafeEqual(received, expected);
## }
// Express example
app.post('/webhooks/xentripay', express.raw({ type: 'application/json' }), (req, res) => {
const secret = process.env.XENTRIPAY_WEBHOOK_SECRET;
if (!verifyWebhookSignature(req, secret)) {
return res.status(401).json({ error: 'Invalid signature' });
## }
const payload = JSON.parse(req.body.toString('utf8'));
console.log('Event received:', payload.event);
// Handle the event...
res.status(200).json({ received: true });
## });
## Verification -- Python
## PYTHON
import hmac
import hashlib
def verify_webhook_signature(raw_body: bytes, secret: str, received_signature: str) -> bool:
## """
raw_body: the raw request body bytes (do NOT pass parsed JSON)
secret: your webhook secret
received_signature: value of X-Xentripay-Signature header (e.g. "sha256=abc123...")
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 9
## """
expected = 'sha256=' + hmac.new(
secret.encode('utf-8'),
raw_body,
hashlib.sha256
## ).hexdigest()
# Use compare_digest to prevent timing attacks
return hmac.compare_digest(expected, received_signature)
# Flask example
from flask import Flask, request, abort
import os
app = Flask(__name__)
@app.route('/webhooks/xentripay', methods=['POST'])
def handle_webhook():
secret = os.environ['XENTRIPAY_WEBHOOK_SECRET']
raw_body = request.get_data()  # Raw bytes -- do not call request.json here
received_sig = request.headers.get('X-Xentripay-Signature', '')
if not verify_webhook_signature(raw_body, secret, received_sig):
abort(401)
payload = request.get_json(force=True)
print('Event received:', payload['event'])
# Handle the event...
return {'received': True}, 200
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 10
Verification -- PHP
## PHP
function verifyWebhookSignature(string $rawBody, string $secret, string $receivedSignature): bool {
$expected = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
return hash_equals($expected, $receivedSignature);
## }
## // Usage
$rawBody = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_XENTRIPAY_SIGNATURE'] ?? '';
$secret = getenv('XENTRIPAY_WEBHOOK_SECRET');
if (!verifyWebhookSignature($rawBody, $secret, $signature)) {
http_response_code(401);
exit('Invalid signature');
## }
$payload = json_decode($rawBody, true);
echo 'Event: ' . $payload['event'];
## 7. Retry Policy
If your server does not respond with a
## 2xx
status code (200, 201, 202, etc.), XentriPay will automatically retry
the delivery using exponential backoff.
AttemptDelay after previous failure
130 seconds
22 minutes
310 minutes
430 minutes
51 hour
After 5 failed attempts, the delivery is marked as permanently
## FAILED
and no further retries will occur. You
can trigger a manual retry from the XentriPay dashboard, or via the API:
POST /api/webhooks/retry/{deliveryLogId}
Pass the
deliveryLogId
from the delivery log entry you want to retry (see Delivery Logs).
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 11
What counts as a success?
Your endpoint must return any HTTP status code in the
## 2xx
range (e.g.,
## 200 OK
). Any other response --
including
## 4xx
and
## 5xx
codes, timeouts, or connection errors -- is treated as a failure.
Idempotency -- handling duplicate deliveries
Because of retries, your server may receive the same event more than once. Use the
idempotencyKey

field in the payload to detect and safely ignore duplicates.
## JAVASCRIPT
// Example: Node.js idempotency check using Redis
const { idempotencyKey } = payload;
const alreadyProcessed = await redis.get(`webhook:${idempotencyKey}`);
if (alreadyProcessed) {
return res.status(200).json({ received: true, duplicate: true });
## }
// Process the event...
await redis.set(`webhook:${idempotencyKey}`, '1', 'EX', 86400); // expire after 24 hours
## 8. All Event Types
Subscribe to only the events your application needs.
## Payouts
EventWhen it fires
PAYOUT_CREATEDA payout has been created and is being processed
PAYOUT_CONFIRMEDA payout has been confirmed
PAYOUT_SUCCESSA payout was delivered successfully to the recipient
PAYOUT_FAILEDA payout failed to deliver
PAYOUT_REVERSEDA payout was reversed/refunded
## Single Payouts
EventWhen it fires
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 12
SINGLEPAYOUTCREATEDPENDINGOTPA single payout is waiting for OTP confirmation
SINGLEPAYOUTCONFIRMEDA single payout OTP was confirmed, payout proceeding
## Bulk Payouts
EventWhen it fires
BULKPAYOUTCREATEDPENDINGOTPA bulk payout batch is waiting for OTP confirmation
BULKPAYOUTCONFIRMEDA bulk payout batch OTP was confirmed, processing
## Payment Requests
EventWhen it fires
PAYMENTREQUESTCREATEDA payment request has been created
PAYMENTREQUESTCOMPLETEDA payment request was paid successfully
PAYMENTREQUESTFAILEDA payment request failed or expired
PAYMENTREQUESTREVERSEDA payment request payment was reversed
## Collections
EventWhen it fires
COLLECTION_CREATEDA collection has been initiated
COLLECTION_PENDINGA collection is awaiting payment confirmation
COLLECTION_SUCCESSFULA collection was received successfully
COLLECTION_FAILEDA collection attempt failed
## Payment Links
EventWhen it fires
PAYMENTLINKCREATEDA payment link was created
PAYMENTLINKUPDATEDA payment link was updated
PAYMENTLINKCONTRIBUTION_CREATEDSomeone started a payment via a payment link
PAYMENTLINKCONTRIBUTION_SUCCESSFULPayment via a payment link was completed
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 13
PAYMENTLINKCONTRIBUTION_FAILEDPayment via a payment link failed
PAYMENTLINKEXPIREDA payment link reached its expiry date
## Checkouts
EventWhen it fires
CHECKOUT_CREATEDA checkout session was created
CHECKOUT_PENDINGA checkout is awaiting payment
CHECKOUT_SUCCESSFULA checkout was completed successfully
CHECKOUT_FAILEDA checkout payment failed
## 9. Delivery Logs
XentriPay keeps a full log of every webhook delivery attempt for your account. You can use this to:
## -
See exactly what was sent and when
## -
Check the delivery status (
## SUCCESS
## ,
## PENDING
## ,
## FAILED
## )
## -
See how many delivery attempts were made
## -
See the error message if a delivery failed
## -
Manually retry a failed delivery
Delivery logs are available in the XentriPay dashboard under Webhooks -> Delivery Logs, or you can
access them via the API (paginated, newest first):
GET /api/webhooks/deliveries?businessAccountId={businessAccountId}
To manually retry a specific failed delivery, use its
deliveryLogId
## :
POST /api/webhooks/retry/{deliveryLogId}
Each log entry includes:
FieldDescription
deliveryLogIdThe delivery log ID
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 14
businessAccountIdYour business account ID
eventTypeThe event that was sent
urlThe URL XentriPay sent to
statusSUCCESS, PENDING, or FAILED
attemptCountHow many times delivery was attempted
maxAttemptsMaximum number of delivery attempts
lastErrorError message from the last failed attempt
nextRetryAtWhen the next retry is scheduled (if pending)
createdAtWhen the delivery record was created
## 10. Best Practices
Respond quickly
Your webhook endpoint should return
## 200 OK
as fast as possible -- ideally within 5 seconds. If processing
takes longer, acknowledge receipt immediately and handle the event in a background job.
## JAVASCRIPT
app.post('/webhooks/xentripay', async (req, res) => {
// Respond immediately
res.status(200).json({ received: true });
// Process in the background
processWebhookEvent(req.body).catch(console.error);
## });
Always verify the signature
Never skip signature verification, even in development or testing. This protects your application from forged
requests.
Handle duplicates
Because of retries, the same event can arrive more than once. Always check the
idempotencyKey
before
processing business logic like updating a database or sending a notification.
Use a public HTTPS URL
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 15
We strongly recommend an
https://
URL so the payload and signature are protected in transit. Your
endpoint must be publicly reachable: URLs that resolve to
localhost
, loopback, or private/internal network
addresses are rejected during registration.
Log everything
Keep your own logs of received webhook payloads, at least for 24-48 hours. This makes debugging much
easier if something goes wrong.
Return 2xx even for unknown events
If you receive an event type you do not handle, still return
## 200 OK
. Returning an error code will trigger
unnecessary retries.
## JAVASCRIPT
const handlers = {
COLLECTION_SUCCESSFUL: handleCollection,
PAYOUT_SUCCESS: handlePayout,
## };
const handler = handlers[payload.event];
if (handler) {
await handler(payload.data);
## }
// Always return 200, even for unknown events
res.status(200).json({ received: true });
Test your endpoint before going live
Use a tool like ngrok to expose your local server and register it as a webhook during development. This lets
you test the full integration without deploying.
## Quick Reference
What you needWhere to find it
Register webhookPOST /api/webhooks/set
List your webhooksGET /api/webhooks/{businessAccountId}
Toggle on/offPUT /api/webhooks/{webhookId}/toggle
XentriPay  |  Webhooks Integration Guide

XentriPay Webhooks - Integration GuidePage 16
All event typesGET /api/webhooks/events
Delivery logsGET /api/webhooks/deliveries?businessAccountId=...
Manually retry a deliveryPOST /api/webhooks/retry/{deliveryLogId}
Signature headerX-Xentripay-Signature: sha256=<hex>
AlgorithmHMAC-SHA256 on raw JSON body
Max retries5 attempts
Retry schedule30s -> 2min -> 10min -> 30min -> 1hr
For questions or support, contact the XentriPay integration team.
XentriPay  |  Webhooks Integration Guide