import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.delay_profile import DelayProfile
from ...models.release_profile import ReleaseProfile
from ...schemas.delay_profile import DelayProfileCreate, DelayProfileOut, DelayProfileUpdate
from ...schemas.release_profile import ReleaseProfileCreate, ReleaseProfileOut, ReleaseProfileUpdate

router = APIRouter()


# ── Release Profiles ──────────────────────────────────────────────────────────


@router.get("/release", response_model=list[ReleaseProfileOut])
def list_release_profiles(db: Session = Depends(get_db)):
    return (
        db.query(ReleaseProfile)
        .order_by(ReleaseProfile.is_default.desc(), ReleaseProfile.name)
        .all()
    )


@router.post("/release", response_model=ReleaseProfileOut, status_code=201)
def create_release_profile(payload: ReleaseProfileCreate, db: Session = Depends(get_db)):
    rp = ReleaseProfile(
        name=payload.name,
        is_default=False,
        region_priority=json.dumps(payload.region_priority),
        prefer_no_intro=payload.prefer_no_intro,
        accept_hacks=payload.accept_hacks,
        accept_unlicensed=payload.accept_unlicensed,
        preferred_formats=json.dumps(payload.preferred_formats),
    )
    db.add(rp)
    db.commit()
    db.refresh(rp)
    return rp


@router.put("/release/{profile_id}", response_model=ReleaseProfileOut)
def update_release_profile(
    profile_id: int, payload: ReleaseProfileUpdate, db: Session = Depends(get_db)
):
    rp = db.query(ReleaseProfile).filter_by(id=profile_id).first()
    if not rp:
        raise HTTPException(status_code=404, detail="Release profile not found")
    if payload.name is not None:
        rp.name = payload.name
    if payload.region_priority is not None:
        rp.region_priority = json.dumps(payload.region_priority)
    if payload.prefer_no_intro is not None:
        rp.prefer_no_intro = payload.prefer_no_intro
    if payload.accept_hacks is not None:
        rp.accept_hacks = payload.accept_hacks
    if payload.accept_unlicensed is not None:
        rp.accept_unlicensed = payload.accept_unlicensed
    if payload.preferred_formats is not None:
        rp.preferred_formats = json.dumps(payload.preferred_formats)
    db.commit()
    db.refresh(rp)
    return rp


@router.delete("/release/{profile_id}", status_code=204)
def delete_release_profile(profile_id: int, db: Session = Depends(get_db)):
    rp = db.query(ReleaseProfile).filter_by(id=profile_id).first()
    if not rp:
        raise HTTPException(status_code=404, detail="Release profile not found")
    if rp.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the default profile")
    db.delete(rp)
    db.commit()


# ── Delay Profiles ────────────────────────────────────────────────────────────


@router.get("/delay", response_model=list[DelayProfileOut])
def list_delay_profiles(db: Session = Depends(get_db)):
    return db.query(DelayProfile).order_by(DelayProfile.is_default.desc(), DelayProfile.name).all()


@router.post("/delay", response_model=DelayProfileOut, status_code=201)
def create_delay_profile(payload: DelayProfileCreate, db: Session = Depends(get_db)):
    dp = DelayProfile(**payload.model_dump())
    dp.is_default = False
    db.add(dp)
    db.commit()
    db.refresh(dp)
    return dp


@router.put("/delay/{profile_id}", response_model=DelayProfileOut)
def update_delay_profile(
    profile_id: int, payload: DelayProfileUpdate, db: Session = Depends(get_db)
):
    dp = db.query(DelayProfile).filter_by(id=profile_id).first()
    if not dp:
        raise HTTPException(status_code=404, detail="Delay profile not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(dp, field, value)
    db.commit()
    db.refresh(dp)
    return dp


@router.delete("/delay/{profile_id}", status_code=204)
def delete_delay_profile(profile_id: int, db: Session = Depends(get_db)):
    dp = db.query(DelayProfile).filter_by(id=profile_id).first()
    if not dp:
        raise HTTPException(status_code=404, detail="Delay profile not found")
    if dp.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the default profile")
    db.delete(dp)
    db.commit()
