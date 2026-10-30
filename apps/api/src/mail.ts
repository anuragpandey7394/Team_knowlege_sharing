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
      await transport.sendMail({
        from: "Team Knowledge <no-reply@tka.test>",
        to,
        subject,
        text,
      });
    },
    close() {
      transport.close();
    },
  };
}
