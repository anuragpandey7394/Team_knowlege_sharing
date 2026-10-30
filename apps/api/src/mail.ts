import nodemailer from "nodemailer";
export function createMailAdapter(host: string, port: number) {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    connectionTimeout: 3000,
    socketTimeout: 3000,
  });
  return {
    async send(to: string, subject: string, text: string) {
      for (let attempt = 0; ; attempt++) {
        try {
          await transport.sendMail({
            from: "Team Knowledge <no-reply@tka.test>",
            to,
            subject,
            text,
          });
          return;
        } catch (error) {
          // Retry only before the SMTP connection exists: DATA may already be accepted later.
          const safeToRetry =
            error instanceof Error &&
            "command" in error &&
            error.command === "CONN" &&
            "code" in error &&
            ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(
              String(error.code),
            );
          if (attempt >= 2 || !safeToRetry) throw error;
        }
      }
    },
    close() {
      transport.close();
    },
  };
}
