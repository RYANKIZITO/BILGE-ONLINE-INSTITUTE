// src/middlewares/role.middleware.js
export const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).send('Forbidden');
    }
    next();
  };
};
