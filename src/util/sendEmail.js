const nodemailer = require("nodemailer");

const Config = require('../../config.json');

//The shared transport, created once and reused across every email that is sent.
let Transport = null;

//Friendly explanations for the error codes nodemailer hands back, so the user is
//never shown a raw SMTP stack trace.
const ErrorMessages = {
    ECONFIG: "The email service is not configured.",
    EAUTH: "The mail server rejected our login details.",
    ECONNECTION: "The mail server could not be reached.",
    ECONNREFUSED: "The mail server refused the connection.",
    ESOCKET: "The connection to the mail server failed.",
    ETIMEDOUT: "The mail server took too long to respond.",
    EDNS: "The mail server's address could not be resolved.",
    EENVELOPE: "The mail server rejected the email address.",
    EMESSAGE: "The mail server rejected the message.",
    ESTREAM: "The message could not be written to the mail server.",
};

/**
 * Turns a nodemailer error into something that can be shown to a user.
 *
 * @param {Error} error - The error thrown by nodemailer.
 * @returns {String} - A human readable reason.
 */
function describeError(error) {
    return ErrorMessages[error.code] || "The email service is currently unavailable.";
}

/**
 * Creates the transport, or returns the one that already exists.
 *
 * @returns {Object} - The nodemailer transport.
 */
function getTransport() {
    if (Transport) return Transport;

    const Email = Config.Email;

    if (!Email || !Email.Host || !Email.User) {
        const error = new Error("The email service is not configured.");
        error.code = "ECONFIG";
        error.userMessage = error.message;
        throw error;
    }

    Transport = nodemailer.createTransport({
        host: Email.Host,
        port: Email.Port,
        auth: {
            user: Email.User,
            pass: Email.Password,
        },
    });

    return Transport;
}

/**
 * Checks the mail server connection and credentials using nodemailer's built-in
 * verify(). This never throws, so callers can decide what to tell the user.
 *
 * @returns {Promise<{Ok: Boolean, Reason: String|null, Code: String|null}>} - The verification result.
 */
async function verify() {
    try {
        await getTransport().verify();

        return { Ok: true, Reason: null, Code: null };
    } catch (error) {
        //Throw the transport away so the next attempt builds a fresh connection.
        Transport = null;

        console.error('[EMAIL] Mail server verification failed: ' + (error.message || error.code));

        return { Ok: false, Reason: describeError(error), Code: error.code || null };
    }
}

/**
 * Sends an email to a specified address. The mail server is verified first so a
 * server that is down is reported before we ever try to send.
 * 
 * @param {BigInt} address - The user ID to fetch data for.
 * @param {String} subject - The email subject.
 * @param {String} body - The email body.
 * @returns {Promise<Object>} - The response data.
 */
module.exports = async function(address, subject, body) {

    const Status = await verify();

    if (!Status.Ok) {
        const error = new Error(Status.Reason);
        error.code = Status.Code;
        error.userMessage = Status.Reason;

        throw error;
    }

    try {
        const Res = await getTransport().sendMail({
            from: Config.Email.From,
            to: address,
            subject: subject,
            html: body,
        });

        return Res;
    } catch (error) {
        //The connection may have dropped mid-send, so rebuild it next time.
        Transport = null;

        error.userMessage = describeError(error);

        console.error('[REQUEST] Error sending email:', error);
        throw error;
    }
};

module.exports.verify = verify;
