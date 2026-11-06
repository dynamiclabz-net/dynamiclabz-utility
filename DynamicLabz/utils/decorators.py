from functools import wraps
from rest_framework.response import Response
from rest_framework import status


def handle_exceptions(view_func):
    """Decorator to handle exceptions in API views"""
    @wraps(view_func)
    def _wrapped_view(self, request, *args, **kwargs):
        try:
            return view_func(self, request, *args, **kwargs)
        except Exception as ex:
            # logger.error(ex, exc_info=True)
            print(ex)
            return Response(
                {
                    "success": False,
                    "user_not_logged_in": False,
                    "user_unauthorized": False,
                    "data": None,
                    "error": str(ex)
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    return _wrapped_view


def check_authentication(required_role=None):
    '''Checks if user is logged in or not.
    If required_role is passed (as str or list), will check for that as well.'''
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(self, request, *args, **kwargs):
            user = request.user

            if not user.is_authenticated:
                return Response(
                    {
                        "success": False,
                        "user_not_logged_in": True,
                        "user_unauthorized": False,
                        "data": None,
                        "error": "User not authenticated"
                    }, status=status.HTTP_400_BAD_REQUEST
                )

            if required_role:
                # Convert to list if it's a string
                allowed_roles = required_role if isinstance(required_role, (list, tuple, set)) else [required_role]

                if getattr(user, "role", None) not in allowed_roles:
                    return Response(
                        {
                            "success": False,
                            "user_not_logged_in": False,
                            "user_unauthorized": True,
                            "data": None,
                            "error": f"User role must be one of {allowed_roles}"
                        }, status=status.HTTP_403_FORBIDDEN
                    )

            return view_func(self, request, *args, **kwargs)

        return _wrapped_view
    return decorator
