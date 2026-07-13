// Bridges control-plane Tenant fields into this tenant's own admin-facing
// API. Deliberately minimal — only the addons object is serialized, never
// slug/domains/secrets, since anything added here becomes readable by any
// authenticated store admin.
exports.get = async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        addons: {
          aiProductReview: {
            enabled: !!req.tenant?.addons?.aiProductReview?.enabled,
          },
        },
      },
    });
  } catch (err) { next(err); }
};
