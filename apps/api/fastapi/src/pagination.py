"""
Pagination utilities for list endpoints.

This module provides standard pagination for all list endpoints,
ensuring consistent API behavior and better user experience.
"""

from typing import Annotated, Generic, TypeVar

from fastapi import Depends, Query
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response model."""

    data: list[T]
    count: int
    page: int = 1
    size: int = 100
    total_pages: int = 1

    @staticmethod
    def compute_offset(page: int, page_size: int) -> int:
        return (page - 1) * page_size

    def __init__(
        self, data: list[T], count: int, page: int = 1, size: int = 100, **kwargs: int
    ) -> None:
        total_pages = (count + size - 1) // size if count > 0 else 1
        kwargs.pop("total_pages", None)
        super().__init__(
            data=data,
            count=count,
            page=page,
            size=size,
            total_pages=total_pages,
            **kwargs,
        )


class PaginationParams(BaseModel):
    """
    Pagination parameters for API endpoints.

    Use this as a dependency to standardize pagination across endpoints.
    Provides both page-based and offset-based pagination.
    """

    page: int = Field(default=1, ge=1, description="Page number (1-indexed)")
    size: int = Field(default=100, ge=1, le=1000, description="Items per page")

    @property
    def skip(self) -> int:
        """Calculate skip/offset value for database queries."""
        return (self.page - 1) * self.size

    @property
    def limit(self) -> int:
        """Get limit value for database queries (alias for size)."""
        return self.size


# FastAPI dependency function for pagination
def get_pagination_params(
    page: Annotated[int, Query(ge=1, description="Page number (1-indexed)")] = 1,
    size: Annotated[int, Query(ge=1, le=1000, description="Items per page")] = 100,
) -> PaginationParams:
    """
    Dependency to extract pagination parameters from query string.

    Usage:
        @router.get("/resources")
        def list_resources(pagination: Annotated[PaginationParams, Depends(get_pagination_params)]):
            resources = fetch_list(skip=pagination.skip, limit=pagination.limit)
            return PaginatedResponse(data=resources, count=total, page=pagination.page, size=pagination.size)
    """
    return PaginationParams(page=page, size=size)


# Annotated alias for route signatures (keeps `Depends` out of the signature).
PaginationDep = Annotated[PaginationParams, Depends(get_pagination_params)]
