# Slop Hammer Support

Slop Hammer is a Chrome extension for checking selected webpage text for signs
of AI-generated or AI-assisted writing.

## Getting started

1. Install the extension.
2. Open the Slop Hammer options page.
3. Install the official classifier model from Hugging Face.
4. Open any normal `http` or `https` webpage.
5. Select at least 75 characters of text.
6. Right-click the selection and choose **Check with Slop Hammer**.

The result card appears on the page after analysis completes.

## Troubleshooting

If Slop Hammer does not appear on a page:

- Make sure the page is an `http` or `https` webpage.
- Refresh the page after installing or updating the extension.
- Check Chrome's extension site-access settings.
- Try the local fixture page from the project workflow if you are testing a
  development build.

If model installation fails:

- Check your network connection.
- Try the Hugging Face install action again.
- Use the manual `.zip` fallback if you have a valid Slop Hammer model bundle.

## Reporting issues

Report bugs or support issues on GitHub:

https://github.com/slomin/slophammer/issues/new

Please include:

- what you were trying to do
- which page or type of page you were using
- whether the model was installed
- any visible error message
- your Chrome version, if relevant

## Privacy

See the privacy policy:

https://github.com/slomin/slophammer/blob/main/docs/privacy.md
