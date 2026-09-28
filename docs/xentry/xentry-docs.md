

XentriPay-PoweringpaymentsacrossAfrica
XentriPay
APIDocumentation
Collections|Payouts|Checkout

XentriPayAPIDocumentationPage2
XentriPay-PoweringpaymentsacrossAfrica
TableofContents
1.Introduction
1.Introduction
2.BaseURL
3.Authentication
4.CollectionsAPI
•4.1OverviewandStatusLifecycle
•4.2InitiateaMoMoCollection
•4.3InitiateaCardCollection
•4.4CustomerReference(customerRef)
•4.5CheckCollectionStatus
•4.6CollectionsFieldDescriptions
•4.7ErrorResponses
1.PayoutsAPI
•5.1Overview
•5.2InitiateaPayout
•5.3CheckPayoutStatus
•5.4PayoutStatusFlow
•5.5PayoutsFieldDescriptions
1.BankandMobileMoneyProviderIDs
2.CheckoutAPI
•7.1OverviewandFlow
•7.2Step1:CreateaCheckoutSession
•7.3Step2:PaywithMobileMoney
•7.4Step2:PaywithCard
•7.5CheckCheckoutSessionStatus
•7.6CheckoutFieldDescriptions
•7.7ImportantNotes
ThisdocumentdescribestheAPIendpointsavailableforinitiatingCollections,Payouts,andChec
koutpaymentsintheXentriPaysystem.Itincludesrequestandresponseformats,sample
payloads,anderrorhandlingdetails.
XentriPaysupportsmultiplepaymentmethods,includingMobileMoney(MoMo)andCard
payments,allowingbusinessestocollectpaymentsfromcustomersorsendpayoutsusingdifferent
channelsdependingontheirusecase.

XentriPayAPIDocumentationPage3
XentriPay-PoweringpaymentsacrossAfrica
2.BaseURL
3.Authentication
X-XENTRIPAY-KEY:<your_api_key>
Content-Type:application/json
## {
## "status":401,
"message":"InvalidordisabledAPIkey"
## }
4.CollectionsAPI
InadditiontodirectAPI-basedcollectionsandpayouts,XentriPayalsoprovidesaCheckoutAPI,
whichenablessession-basedpaymentssuitableforwebandmobileapplications,supportingboth
MobileMoneyandCardpaymentflows.
XentriPayprovidestwoenvironments:
EnvironmentBaseURL
## Productionhttps://xentripay.com
## Testhttps://merchant.test.xentripay.com
Usethetestenvironmentwhileintegratingandvalidatingyourimplementation.Switchtothe
productionURLonlywhenyouarereadytogolive.
Allendpointpathsinthisdocumentarethesameacrossbothenvironments.Forexample,
## /api/co
llections/initiate
mapsto:
## •
## Production:
https://xentripay.com/api/collections/initiate
## •
## Test:
https://merchant.test.xentripay.com/api/collections/initiate
AllendpointsrequireavalidAPIkeypassedinthe
## X-XENTRIPAY-KEY
header.
YourAPIkeyisgeneratedandprovidedbyXentriPayfromthemerchantdashboard.Keepitsecure
anddonotexposeitinclient-sideorfront-endcode.
UnauthorizedResponse
IftheAPIkeyismissingorinvalid,theAPIreturns:
4.1OverviewandStatusLifecycle

XentriPayAPIDocumentationPage4
XentriPay-PoweringpaymentsacrossAfrica
Minimumamount:100RWFpercollection.
POST/api/collections/initiate
X-XENTRIPAY-KEY:<your_api_key>
Content-Type:application/json
## {
## "email":"customer@example.com",
"cname":"JohnDoe",
## "amount":500,
## "cnumber":"0780371519",
## "msisdn":"250780371519",
"currency":"RWF",
## "pmethod":"momo",
"chargesIncluded":true
## }
Note:amountmustbeawholenumber(nodecimals)whencurrencyisRWF.Minimumis100RWF.
TheCollectionsAPIallowsabusinesstoinitiateapaymentcollectionrequestfromacustomer.
XentriPaysupportsMobileMoney(MoMo)andCardascollectionpaymentmethods.Thepayment
methodisspecifiedusingthe
pmethod
fieldintherequestbody.
## Howacollectionisprocessed:
1.Youcall
POST/api/collections/initiate
## :thecollectionissavedwithstatus
## PENDING
## .
2.ForMoMo:thecustomerreceivesapromptontheirphoneandconfirmsordeclines.
3.ForCard:thecustomerisredirectedtothecardpaymentpageviathe
url
intheresponse.
4.XentriPay'sbackgroundschedulerpollsthepaymentgatewayandupdatesthestatusautomatically.
StatusMeaning
PENDINGPaymenthasbeeninitiatedandisawaitingconfirmationfromtheprovider.
SUCCESSPaymentwasconfirmed.Thebusinesswallethasbeencredited.
FAILEDPaymentwasdeclined,cancelled,ortimedout.
4.2InitiateaMoMoCollection
## Endpoint
RequestHeaders
RequestBody

XentriPayAPIDocumentationPage5
XentriPay-PoweringpaymentsacrossAfrica
Note:ForMoMocollections,urlisnull.AURLisonlyreturnedforcardpayments.
POST/api/collections/initiate
X-XENTRIPAY-KEY:<your_api_key>
Content-Type:application/json
## {
## "email":"customer@example.com",
"cname":"JohnDoe",
## "cnumber":"0780371519",
## "amount":500,
## "msisdn":"250780371519",
"currency":"RWF",
## "pmethod":"cc",
## "redirecturl":"https://yourdomain.com/payment/callback",
## "returl":"https://yourdomain.com/payment/return",
"chargesIncluded":true
## }
SampleResponse:HTTP200OK
## {
"reply":"ThankyouforinitiatinganewPayment.Checkyourpendingtransactionson182*7*1#to
## "url":null,
## "success":1,
"authkey":"vzimHGg2_iXcmwpwxdwy_KKW5zMr3_iV",
## "tid":"680780365824",
"refid":"RefE1108D491A1C",
## "retcode":0
## }
4.3InitiateaCardCollection
## Endpoint
RequestHeaders
RequestBody
SampleResponse:HTTP200OK

XentriPayAPIDocumentationPage6
XentriPay-PoweringpaymentsacrossAfrica
Note:Forcardcollections,redirectthecustomertotheurlintheresponse.Thisopensthecardpayment
pagewherethecustomerenterstheircarddetails.
## {
## "email":"customer@example.com",
"cname":"JohnDoe",
## "cnumber":"0780371519",
## "amount":500,
## "msisdn":"250780371519",
"currency":"RWF",
## "pmethod":"momo",
"customerRef":"ORDER-20240101-001",
"chargesIncluded":true
## }
GET/api/collections/status/{reference}
## {
"reply":"ThankyouforinitiatinganewPayment.ContinuetoprocessCardPayment",
## "url":"https://urubutopay.rw/pay-now/card/process/11202512191833068307",
## "success":1,
"authkey":"p1wYqVAu1cm1UqfuNcROGNRZSRzH4TGq",
## "tid":"261002756096",
"refid":"Ref8511ED612198",
## "retcode":0
## }
4.4CustomerReference(customerRef)
Toimprovetransactiontraceabilityandreconciliation,clientsarestronglyencouragedtoincludea
customerRef
wheninitiatingacollection.
## The
customerRef
isaclient-definedidentifierthatisstoredwiththetransaction.Itdoesnotchange
theAPIresponseorpaymentflow,butallowsbothyouandXentriPaytoeasilyidentify,track,and
supportspecifictransactions.
SampleRequestwithcustomerRef
4.5CheckCollectionStatus
Thisendpointreturnsthecurrentstatusofacollection.Youcanuseeitherthe
customerRef
you
providedatinitiation,orthe
refid
returnedintheinitiationresponse.
## Endpoint
## The
## {reference}
valuecanbeeitherthe
customerRef
orthe
refid
ofthecollection.

XentriPayAPIDocumentationPage7
XentriPay-PoweringpaymentsacrossAfrica
GEThttps://xentripay.com/api/collections/status/ORDER-20240101-001
GEThttps://xentripay.com/api/collections/status/RefE1108D491A1C
## {
"customerRef":"ORDER-20240101-001",
"rid":"RefE1108D491A1C",
"status":"SUCCESS",
"updatedAt":"2025-09-25T23:57:50.672947"
## }
SampleRequest
or
SampleResponse
4.6CollectionsFieldDescriptions
RequestFields
FieldTypeRequiredDescription
emailStringYesCustomeremailaddress.
cnameStringYesCustomerfullname.
amountNumberYesAmounttocollect.MustbeawholenumberforRWF.Minimum:
## 100.
cnumberStringYesCustomerphonenumberinlocal10-digitformat(e.g.,
0780371519).Nospacesorletters.
msisdnStringYesCustomerphonenumberininternationalformatwithcountry
code(e.g.,250780371519).
currencyStringYesCurrencycode.CurrentlyonlyRWFissupported.
pmethodStringYesPaymentmethod.UsemomoforMobileMoneyorccforcard
payment.
chargesIncludedBooleanNoIftrue,thetransactionfeeisdeductedfromthespecifiedamount.
## Iffalseoromitted,thefeeisaddedontop.
customerRefStringNoClient-defineduniquereferencefortrackingandreconciliation.
## Stronglyrecommended.
redirecturlStringRequiredfor
cc
URLtoredirectthecustomerafterthecardpaymentisprocessed
(callbackURL).
returlStringRequiredfor
cc
URLtoreturnthecustomertoafterthefullpaymentflow
completes.
detailsStringNoOptionaldescriptionornoteaboutthepayment.

XentriPayAPIDocumentationPage8
XentriPay-PoweringpaymentsacrossAfrica
5.PayoutsAPI
ResponseFields
FieldTypeDescription
replyStringHuman-readablemessagefromthegateway.
urlStringCardpaymentURL.Populatedforcard(cc)paymentsonly.nullfor
MoMo.
successNumber1forsuccess,0forfailure.
authkeyStringAuthenticationkeyforthistransactioninstance.
tidStringTransactionIDassignedbythepaymentgateway.
refidStringXentriPayreferenceID.Usethis(oryourcustomerRef)tocheckthe
transactionstatus.
retcodeNumberReturncode.0meanstherequestwasaccepted.Seeerrorcodes
below.
4.7ErrorResponses
HTTP400:ValidationErrors
ScenarioResponse
Missingemail{"message":"Emailisrequired","status":400}
Invalidemailformat{"message":"Emailmustbeavalidemailaddress","status":400}
Invalidcnumberformat{"message":"Customernumbermustbeexactly10digitswithnospacesor
letters","status":400}
Unsupportedcurrency{"message":"Currencymustbe'RWF'","status":400}
Amounttoolow{"message":"Amountmustbeatleast100RWF","status":400}
retcodeErrorValues
retcodeMeaning
0Requestacceptedsuccessfully.
606Paymentfailed.Checkthatthephonenumberiscorrectandhassufficient
funds.
607Transactiondeclinedbythemobilemoneyprovider.
608Paymenttimedout.Pleasetryagain.
5.1Overview

XentriPayAPIDocumentationPage9
XentriPay-PoweringpaymentsacrossAfrica
Note:PayoutrequestsrequireOTP(One-TimePassword)confirmationbeforebeingprocessed.After
callingtheinitiateendpoint,anOTPissenttotheauthorizedbusinessuser.Thepayoutisonly
processedafterOTPconfirmation.
POST/api/payment-requests
X-XENTRIPAY-KEY:<your_api_key>
Content-Type:application/json
## {
"customerReference":"TXN-20240402-001",
"telecomProviderId":"63510",
## "msisdn":"0788302208",
"name":"JohnDoe",
"transactionType":"PAYOUT",
"currency":"RWF",
## "amount":500
## }
Note:Forpayouts,msisdnisinlocalformat(e.g.,0788302208)withoutthecountrycodeprefix.
ThePayoutsAPIallowsabusinesstosendmoneytoarecipientviaMobileMoneyorbanktransfer.
## Payoutsareprocessedthroughsupportedproviders.
ThisAPIistypicallyusedfordisbursementssuchassalaries,refunds,commissions,orpartner
payments.
5.2InitiateaPayout
## Endpoint
RequestHeaders
RequestBody
SampleResponse:HTTP200OK

XentriPayAPIDocumentationPage10
XentriPay-PoweringpaymentsacrossAfrica
Note:Afterreceivingthisresponse,thepayoutwillbeheldasPENDINGuntiltheauthorizeduser
confirmsviaOTP.TheOTPissentautomaticallytotheregisteredemail/phoneofthebusiness.
Important:Thestatusreturnedherereflectsthestatusfromtheexternalpaymentprovider,notthe
internalXentriPaysystemstatus.SeeSection5.4forthemappingbetweenthetwo.
GET/api/payment-requests/check-status?customerRef={customerReference}
GEThttps://xentripay.com/api/payment-requests/check-status?customerRef=TXN-20240402-001
## {
## "id":2812,
"businessName":"AcmeBusinessLtd",
"customerReference":"TXN-20240402-001",
"telecomProvider":"MTNMOBILEMONEY",
"telecomProviderId":"63510",
## "msisdn":"0788302208",
"transactionType":"PAYOUT",
"currency":"RWF",
## "amount":500.00,
"txnCharge":10.00,
"status":"PENDING",
"statusMessage":"PaymentrequestsubmittedtoeKashsuccessfully,awaitingconfirmation.",
"internalRef":"Ref42FCC70F46DD",
"remoteIp":"60.108.66.235",
"paymentChanel":"EKASH",
"validatedAccountName":"JohnDoe",
"externalTransactionRef":null,
"createdAt":"2025-07-20T06:51:44.404271908",
"updatedAt":"2025-07-20T06:51:44.404274362"
## }
5.3CheckPayoutStatus
Thisendpointreturnsthecurrentstatusofapayoutfromthepaymentprovider.Usethe
customerRe
ference
youprovidedwheninitiatingthepayout.
## Endpoint
SampleRequest
SampleResponse

XentriPayAPIDocumentationPage11
XentriPay-PoweringpaymentsacrossAfrica
PENDING-COMPLETED(provider)-SUCCESSFUL(internal)
## PENDING-FAILED
## PENDING-REVERSED
Note:COMPLETEDisonlyusedforpayouts.Collectionsneverusethisstatus:theyusePENDING,
SUCCESS,orFAILED.
## {
## "timestamp":"2025-07-2210:42:52",
"message":"Success",
## "data":{
"status":"COMPLETED",
## "reference_number":"00461025533065",
## "amount":"500.0"
## }
## }
5.4PayoutStatusFlow
StatusMeaning
PENDINGPayoutsubmitted,awaitingproviderconfirmation.
COMPLETEDProviderhasfullyprocessedandfinalizedthepayout.
SUCCESSFULXentriPay'sinternalconfirmationthatpayoutisfinalized.
FAILEDPayoutwasdeclinedorfailedattheproviderlevel.
REVERSEDPayoutwasreversedafterinitialprocessing.
5.5PayoutsFieldDescriptions
RequestFields
FieldTypeRequiredDescription
customerReferenceStringYesUniquereferenceIDforthispayout,definedbyyou.Mustbe
uniquepertransaction.
telecomProviderIdStringYesIDofthepaymentprovider.SeeSection6forthefulllist.
msisdnStringYesRecipientphonenumberinlocalformat(e.g.,0788302208).Do
notincludethecountrycode.
nameStringYesFullnameofthepayoutrecipient.

XentriPayAPIDocumentationPage12
XentriPay-PoweringpaymentsacrossAfrica
6.BankandMobileMoneyProviderIDs
FieldTypeRequiredDescription
transactionTypeStringYesMustbe"PAYOUT".
currencyStringYesCurrencycode.CurrentlyonlyRWFissupported.
amountNumberYesAmounttopayoutbeforecharges.
ResponseFields
FieldTypeDescription
idNumberXentriPayinternalrecordID.
businessNameStringNameofthebusinessinitiatingthepayout.
customerReferenceStringThereferenceprovidedintherequest.
telecomProviderStringHuman-readableprovidername(e.g.,"MTNMOBILEMONEY").
telecomProviderIdStringIDoftheproviderused.
msisdnStringRecipientphonenumber.
transactionTypeStringTransactiontype(e.g.,"PAYOUT").
currencyStringCurrencycode.
amountNumberAmountpaidoutbeforecharges.
txnChargeNumberTransactionfeeapplied.
statusStringCurrentstatus(PENDING,SUCCESSFUL,FAILED,REVERSED).
statusMessageStringGatewaymessagedescribingtheresult.
internalRefStringXentriPayinternalreferenceforthistransaction.
externalTransactionRefStringReferencefromthepaymentgateway.Maybenullinitially.
paymentChanelStringPaymentgatewayused(e.g.,"EKASH").
validatedAccountNameStringAccountnamereturnedbytheprovideraftervalidation.
remoteIpStringIPaddressfromwhichtherequestwasmade.
createdAtDateTimeTimestampwhenthepayoutwascreated.
updatedAtDateTimeTimestampwhenthepayoutwaslastupdated.
## Usetheappropriate
telecomProviderId
fromthetablebelowwheninitiatingpayouts.
ProviderNameID
## MTNMOBILEMONEY63510
## AIRTELRWANDA63514

XentriPayAPIDocumentationPage13
XentriPay-PoweringpaymentsacrossAfrica
7.CheckoutAPI
Important:Theamountisfixedatsessioncreationandcannotbechangedinthepaymentstep.
ProviderNameID
## SPENN63509
## BANQUEDEKIGALI040
## BANQUEPOPULAIREDURWANDA400
## EQUITYBANK192
## ECOBANKRWANDA100
## ACCESSBANKRWANDA115
## GUARANTYTRUSTBANK(RWANDA)070
## INVESTMENTANDMORTGAGEBANK010
## NATIONALCOMMERCIALBANKOF
## AFRICA
## 025
## URWEGOOPPORTUNITYBANK145
## ZIGAMACREDITANDSAVINGS
## SCHEME
## 800
## BANKOFAFRICARWANDA900
## UNGUKABANK950
## BANQUENATIONALEDURWANDA951
7.1OverviewandFlow
TheCheckoutAPIprovidesasession-basedpaymentflow.Unlikedirectcollections,itseparates
thesessioncreationfromtheactualpaymentstep,makingitsuitableforhostedpaymentpagesand
e-commerceflows.
## Two-stepflow:
•Step1:Createasession:Call
POST/api/checkout/sessions
withtheamountandredirectURL.
YoureceiveasessionIDandahostedcheckoutURL.
## •
Step2:Processpayment:Eitherredirectthecustomertothe
checkoutUrl
(hostedUI),orcall
## POST
/api/checkout/sessions/{sessionId}/pay
directlywiththecustomer'spaymentdetails.
7.2Step1:CreateaCheckoutSession
Thisstepcreatesapaymentsessionwithafixedamount.UsethesameendpointforbothMoMo
andcardsessions:thepaymentmethodischoseninStep2.

XentriPayAPIDocumentationPage14
XentriPay-PoweringpaymentsacrossAfrica
POST/api/checkout/sessions
X-XENTRIPAY-KEY:<your_api_key>
Content-Type:application/json
## {
## "amount":200,
"customerFinalUrl":"https://yourdomain.com/payment/result",
"currency":"RWF"
## }
## {
## "id":"cs_69070fe2-b9c7-4c42-9e01-6a73a1ead2a1",
"checkoutUrl":"https://xentripay.com/checkout/cs_69070fe2-b9c7-4c42-9e01-6a73a1ead2a1",
"status":"CREATED"
## }
POST/api/checkout/sessions/{sessionId}/pay
X-XENTRIPAY-KEY:<your_api_key>
Content-Type:application/json
## Endpoint
RequestHeaders
RequestBody
## Response
## Usethe
id
asthe
sessionId
inStep2.Youmayredirectthecustomerto
checkoutUrl
tolet
XentriPay'shostedpagehandlethepayment,orproceeddirectlytoStep2.
7.3Step2:PaywithMobileMoney
## Endpoint
RequestHeaders
RequestBody

XentriPayAPIDocumentationPage15
XentriPay-PoweringpaymentsacrossAfrica
Note:ForMoMopayments,gatewayUrlisnull.Thecustomercompletesthepaymentontheirphoneafter
receivingaprompt.
POST/api/checkout/sessions/{sessionId}/pay
X-XENTRIPAY-KEY:<your_api_key>
Content-Type:application/json
## {
"customerRef":"CHK-081025132217-03",
## "email":"customer@example.com",
"cname":"JohnDoe",
## "cnumber":"0780371519",
## "msisdn":"250780371519",
"details":"PaymentforOrder#1234",
"currency":"RWF",
## "pmethod":"cc",
"gatewayRedirectUrl":"https://yourdomain.com/payment/callback"
## }
## {
"customerRef":"CHK-081025132217-02",
## "email":"customer@example.com",
"cname":"JohnDoe",
## "cnumber":"0780371519",
## "msisdn":"250780371519",
"details":"PaymentforOrder#1234",
"currency":"RWF",
## "pmethod":"momo",
"chargesIncluded":true
## }
## Response
## {
"status":"PENDING",
"redirectTo":"https://yourdomain.com/payment/result?session_id=cs_69070fe2-b9c7-4c42-9e01-6a73a
"gatewayUrl":null,
"paymentMethod":"momo"
## }
7.4Step2:PaywithCard
## Endpoint
RequestHeaders
RequestBody

XentriPayAPIDocumentationPage16
XentriPay-PoweringpaymentsacrossAfrica
Note:Forcardpayments,redirectthecustomertogatewayUrl.Thisopensthecardpaymentpage
(poweredbyUrubuto)wherethecustomerenterstheircarddetails.gatewayRedirectUrlisrequiredfor
cardpaymentsandtellsUrubutowheretoredirectafterprocessing.
GET/api/checkout/sessions/status/{refid}
GEThttps://xentripay.com/api/checkout/sessions/status/RefE1108D491A1C
## {
"refid":"RefE1108D491A1C",
"status":"SUCCESS"
## }
## Response
## {
"status":"PENDING",
"redirectTo":"https://yourdomain.com/payment/result?session_id=cs_0ef17390-8a76-4fff-993d-722e1
"gatewayUrl":"https://urubutopay.rw/pay-now/card/process/11202512191313196629","paymentMethod":
## "cc"
## }
7.5CheckCheckoutSessionStatus
## Returnsthecurrentstatusofacheckoutsessionusingthe
refid
fromthesession'scollection
record.
## Endpoint
SampleRequest
SampleResponse
7.6CheckoutFieldDescriptions
SessionCreationFields(Step1)
FieldTypeRequiredDescription
amountIntegerYesAmounttocharge.Mustbeawholenumber.Fixedforthelifeof
thesession.
customerFinalUrlStringYesURLtoredirectthecustomeroncethepaymentflowcompletes.
currencyStringNoCurrencycode.DefaultstoRWF.CurrentlyonlyRWFis
supported.

XentriPayAPIDocumentationPage17
XentriPay-PoweringpaymentsacrossAfrica
PaymentFields(Step2)
FieldTypeRequiredDescription
customerRefStringNoClient-defined
## Recommended.
referencefortrackingthispayment.
emailStringNoCustomeremailaddress.
cnameStringNoCustomerfullname.
cnumberStringNoCustomerphonenumberinlocal10-digitformat.
msisdnStringNoCustomerphonenumberininternationalformat(e.g.,
## 250780371519).
detailsStringNoDescriptionofwhatthepaymentisfor.
currencyStringNoCurrencycode.Defaultstosessioncurrencyifnotprovided.
pmethodStringYesPaymentmethod:momoforMobileMoney,ccforcard.
chargesIncludedBooleanNoIftrue,feeisdeductedfromtheamount.Defaultstosession
setting.
gatewayRedirectUrlStringRequiredfor
cc
URLtoredirectafterthecardgatewayprocessesthepayment.
NotrequiredforMoMo.
SessionCreationResponseFields
FieldTypeDescription
idStringUniquesessionID.UseassessionIdinthepayendpoint.
checkoutUrlStringHostedcheckoutpageURL.Redirectthecustomerheretolet
XentriPayhandlethepaymentUI.
statusStringSessionstatus.Always"CREATED"whenthesessionisfirstcreated.
PaymentResponseFields
FieldTypeDescription
statusStringPaymentstatus.PENDINGimmediatelyafterinitiation.
redirectToStringURLtoredirectthecustomerafterpaymentisinitiated(includes
sessionIDandstatusasqueryparams).
gatewayUrlStringCardpaymentpageURL.Populatedonlyforcard(cc)payments.null
forMoMo.
paymentMethodStringPaymentmethodused(momoorcc).
7.7ImportantNotes
•The
amount
isfixedatsessioncreationandcannotbechangedinthepaymentstep.

XentriPayAPIDocumentationPage18
XentriPay-PoweringpaymentsacrossAfrica
## •
gatewayRedirectUrl
isrequiredforcardpaymentsandnotrequiredforMoMopayments.
•Each
customerRef
shouldbeuniquetoensureaccuratetrackingandreconciliation.
•ForMoMo:
gatewayUrl
intheresponsewillbe
null
.Thecustomercompletespaymentontheirphone.
•Forcard:redirectthecustomerto
gatewayUrl
tocompletepaymentontheUrubutocardpage.
•The
customerFinalUrl
## (setatsessioncreation)iswherethecustomerissentafterthepayment
completes,regardlessofthepaymentmethod.
XentriPay:PoweringpaymentsacrossAfrica