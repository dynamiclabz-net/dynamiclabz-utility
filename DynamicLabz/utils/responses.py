from rest_framework.response import Response
from rest_framework import status as http


def api_success(data=None, status=http.HTTP_200_OK):
    return Response({
        "success": True,
        "user_not_logged_in": False,
        "user_unauthorized": False,
        "data": data,
        "error": None
    }, status=status)


def api_error(error, status=http.HTTP_400_BAD_REQUEST, unauthorized=False):
    return Response({
        "success": False,
        "user_not_logged_in": False,
        "user_unauthorized": unauthorized,
        "data": None,
        "error": error
    }, status=status)


def not_found(label):
    return api_error(f"{label} not found.", http.HTTP_404_NOT_FOUND)


def forbidden(message="You do not have access to this record."):
    return api_error(message, http.HTTP_403_FORBIDDEN, unauthorized=True)
