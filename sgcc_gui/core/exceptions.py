class SGCCError(Exception):
    """Base exception for SGCC downloader."""


class RequestError(SGCCError):
    """Raised when an HTTP request fails."""


class ValidationError(SGCCError):
    """Raised when user input is invalid."""


class CancelledError(SGCCError):
    """Raised when a task is cancelled."""
