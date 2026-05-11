"""CSV import service for roster and matches - simplified for school sparring."""
import re
from typing import List
from app.schemas import PlayerDTO, MatchDTO, AvailabilityWindow


class CSVImporterService:
    """Service for importing data from CSV."""

    TIME_REGEX = re.compile(r'^([0-1][0-9]|2[0-3]):[0-5][0-9]$')

    @staticmethod
    def parse_roster_csv(csv_content: str) -> List[PlayerDTO]:
        """
        Parse roster CSV - simple flat format.
        Format: id,name,rank,minRestMinutes,notes,availability
        Or: id,name,minRestMinutes,notes,availability (rank optional)
        """
        lines = [line.strip() for line in csv_content.strip().split('\n') if line.strip()]
        players: List[PlayerDTO] = []

        for index, line in enumerate(lines, start=1):
            parts = [p.strip() for p in line.split(',')]
            
            if len(parts) < 2:
                raise ValueError(f"Invalid CSV format at line {index}: id and name are required")
            
            player_id, name = parts[0], parts[1]
            
            # Try to detect if rank is provided (if 3rd column looks like a rank code)
            rank = None
            min_rest_minutes = 30
            notes = ''
            availability_str = ''
            
            if len(parts) > 2:
                # Check if 3rd part looks like a rank (MS1, WS1, etc.) or a number
                third_part = parts[2]
                if third_part and (third_part.startswith('MS') or third_part.startswith('WS') or 
                                   third_part.startswith('MD') or third_part.startswith('WD') or 
                                   third_part.startswith('XD')):
                    # Format: id,name,rank,minRestMinutes,notes,availability
                    rank = third_part
                    min_rest_minutes = int(parts[3]) if len(parts) > 3 and parts[3] else 30
                    notes = parts[4] if len(parts) > 4 else ''
                    availability_str = parts[5] if len(parts) > 5 else ''
                else:
                    # Format: id,name,minRestMinutes,notes,availability (no rank)
                    min_rest_minutes = int(third_part) if third_part else 30
                    notes = parts[3] if len(parts) > 3 else ''
                    availability_str = parts[4] if len(parts) > 4 else ''

            if not player_id or not name:
                raise ValueError(f"Invalid CSV format at line {index}: id and name are required")

            availability = CSVImporterService._parse_availability(availability_str, index)

            players.append(PlayerDTO(
                id=player_id,
                name=name,
                rank=rank,
                availability=availability,
                minRestMinutes=min_rest_minutes,
                notes=notes if notes else None,
            ))

        return players

    @staticmethod
    def parse_matches_csv(csv_content: str) -> List[MatchDTO]:
        """Parse matches CSV - simplified format.
        Format: id,sideA,sideB,sideC,durationSlots,preferredCourt,tags,eventRank,matchType
        sideA, sideB, sideC are semicolon-separated player IDs
        """
        lines = [line.strip() for line in csv_content.strip().split('\n') if line.strip()]
        matches: List[MatchDTO] = []

        for index, line in enumerate(lines, start=1):
            parts = [p.strip() for p in line.split(',')]
            
            # Format: id,sideA,sideB,sideC,durationSlots,preferredCourt,tags,eventRank,matchType
            if len(parts) < 4:
                raise ValueError(f"Invalid CSV format at line {index}: at least id, sideA, sideB, durationSlots required")
            
            match_id = parts[0]
            side_a = [pid.strip() for pid in parts[1].split(';') if pid.strip()]
            side_b = [pid.strip() for pid in parts[2].split(';') if pid.strip()]
            side_c = [pid.strip() for pid in parts[3].split(';')] if len(parts) > 3 and parts[3] else None
            duration_slots = int(parts[4]) if len(parts) > 4 and parts[4] else 1
            preferred_court = int(parts[5]) if len(parts) > 5 and parts[5] else None
            tags = [t.strip() for t in parts[6].split(';')] if len(parts) > 6 and parts[6] else None
            event_rank = parts[7] if len(parts) > 7 and parts[7] else None
            match_type = parts[8] if len(parts) > 8 and parts[8] else 'dual'

            if not match_id:
                raise ValueError(f"Invalid CSV format at line {index}: id is required")

            matches.append(MatchDTO(
                id=match_id,
                sideA=side_a,
                sideB=side_b,
                sideC=side_c,
                matchType=match_type,
                eventRank=event_rank,
                durationSlots=duration_slots,
                preferredCourt=preferred_court,
                tags=tags if tags else None,
            ))

        return matches

    @staticmethod
    def _parse_availability(availability_str: str, line_number: int) -> List[AvailabilityWindow]:
        """Parse availability windows from string."""
        if not availability_str:
            return []
        
        windows = [w.strip() for w in availability_str.split(';') if w.strip()]
        availability: List[AvailabilityWindow] = []
        
        for window in windows:
            parts = window.split('-')
            if len(parts) != 2:
                raise ValueError(f"Invalid availability format at line {line_number}: expected 'HH:mm-HH:mm'")
            
            start, end = parts[0].strip(), parts[1].strip()
            
            if not CSVImporterService.TIME_REGEX.match(start) or not CSVImporterService.TIME_REGEX.match(end):
                raise ValueError(f"Invalid time format at line {line_number}: times must be in HH:mm format")
            
            availability.append(AvailabilityWindow(start=start, end=end))
        
        return availability
