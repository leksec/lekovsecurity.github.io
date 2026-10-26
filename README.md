# Lekov Security Website

The updated site uses separate HTML, CSS and JavaScript files. No build step, framework, Node.js or package installation is needed.

## Files

- `index.html`: homepage, services, calculator markup and contact form.
- `assets/css/main.css`: shared fonts, homepage styles, calculator and responsive layouts.
- `assets/js/main.js`: analytics initialization, site interactions, pricing configuration, calculator and contact form.
- `thanks/index.html`: the existing thank-you page, available at `/thanks/`.
- `404.html`: the existing error page.
- `assets/css/thanks.css`: styles shared by the thank-you and error pages.
- `assets/fonts/`: local DM Mono and Inter fonts.
- `assets/images/`: logo, favicon and background texture.
- `CNAME`, `robots.txt` and `sitemap.xml`: preserved repository settings.

All HTML, CSS and JavaScript is formatted with four-space indentation. `.editorconfig` keeps that convention in supporting editors.

## Preview locally

You can open `index.html` directly. To check the site routes and form navigation, serve this directory locally:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000. Stop the server with Ctrl+C.

## Pricing and enquiries

Edit `LEKOV_PRICING` in `assets/js/main.js` to change the rates, scope options or effort estimates. The existing EUR starting prices, whole-day rounding, training participant milestones and free remediation retest are preserved.

The calculator creates an editable bulleted enquiry message and a title-case subject. The form sends only `name`, `email`, `subject` and `message` to the existing Formspark endpoint. On success, JavaScript opens `thanks/index.html`; no redirect field is sent. A failed submission leaves the entered text in place and allows another attempt.

An actual form submission requires internet access and uses the existing live endpoint. Google Analytics is retained; the page itself uses local fonts and assets.

## Existing repository

The layout follows https://github.com/leksec/lekovsecurity.github.io. The original thank-you page is stored as `thanks/index.html`, rather than `thanks.html`.

Nothing has been committed, pushed or published. The archive contains the complete files for review and local use.
