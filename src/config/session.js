import session from "express-session";
import pgSessionFactory from "connect-pg-simple";

const secret = process.env.SESSION_SECRET;
if (!secret) {
  throw new Error("SESSION_SECRET is required for session middleware");
}

const PgSession = pgSessionFactory(session);

const sessionMiddleware = session({
  name: "bilge.sid",
  secret,
  resave: false,
  saveUninitialized: false,
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
  }),
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

export default sessionMiddleware;
