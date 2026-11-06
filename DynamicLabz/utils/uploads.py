import os

ALLOWED_EXTENSIONS = {
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt',
    '.png', '.jpg', '.jpeg', '.webp', '.zip', '.fig',
}
MAX_UPLOAD_MB = 20


def validate_upload(uploaded_file):
    """Returns an error message for an invalid upload, or None when the file is acceptable."""
    if not uploaded_file:
        return 'A file is required.'
    extension = os.path.splitext(uploaded_file.name)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        return f"File type '{extension or 'unknown'}' is not allowed."
    if uploaded_file.size > MAX_UPLOAD_MB * 1024 * 1024:
        return f'File is too large. Maximum size is {MAX_UPLOAD_MB} MB.'
    return None
